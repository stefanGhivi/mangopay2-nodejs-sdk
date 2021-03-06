var _ = require('underscore');
var path = require('path');
var fs = require('fs');
var RestClient = require('node-rest-client').Client;
var Promise = require('promise');

var apiMethods = require('./apiMethods');

/**
 *
 * @param {string} username     Mangopay username
 * @param {string} password     Mangopay password
 * @returns {string}            The header value base64 encoded for requesting the authentication key
 * @private
 */
function _getBasicAuthHash(username, password) {
    return 'Basic ' + new Buffer(username + ':' + password).toString('base64');
}

var Api = function(config) {
    var defaultConfig = require('./config');
    config = this.config = _.extend({}, defaultConfig, config);

    this.errorHandler = config.errorHandler;

    /**
     * Add default request configuration options
     */
    _.extend(this.requestOptions, {
        requestConfig: {
            timeout: config.connectionTimeout
        },
        responseConfig: {
            timeout: config.responseTimeout
        },
        /**
         * Path options are replacing the ${placeholders} from apiMethods
         */
        path: {
            clientId: config.clientId,
            apiVersion: config.apiVersion
        },
        headers: {
            "Content-Type": "application/json"
        }
    });

    var client = this.client = new RestClient(this.requestOptions);

    /**
     * Iterate trough API methods and register them into the rest client
     */
    _.each(apiMethods, function(method, key){
        client.registerMethod(key, config.baseUrl + method[0], method[1]);
    });

    /**
     * Adds the services to API object
     */
    this._servicesLoader();

    return this;
};

Api.prototype = {
    config: require('./config'),

    requestOptions: {
        headers: {}
    },

    /**
     * Checks if callback is a function or not, and passes the options
     * @param {Object, Function}    callback
     * @param {Object}              options
     * @param {Object}              params      Additional params that extend options
     */
    _getOptions: function(callback, options, params) {
        var options = options || ((_.isObject(callback) && !_.isFunction(callback)) ? callback : {});
        if (params) {
            options = _.extend({}, options, params);
        }

        return options
    },

    /**
     * Main API resource request method
     * @param {string}      method      Mangopay API method to be called
     * @param {function}    callback    Callback function
     * @param {object}      options     Hash of configuration to be passed to request
     * @returns {object} request promise
     */
    method: function(method, callback, options) {
        options = this._getOptions(callback, options);

        if (this.config.debugMode) {
            this.config.logClass(method, options);
        }

        /**
         * If data has parse method, call it before passing data
         */
        if (options.data && options.data instanceof this.models.EntityBase) {
            options.data = this.buildRequestData(options.data);
        } else if (options.data && options.data.toJSON) {
            options.data = options.data.toJSON();
        }
        var self = this;

        /**
         * If there's no OAuthKey, request one
         */
        if (!this.requestOptions.headers.Authorization || this.isExpired()) {
            return new Promise(function(resolve, reject){
                self.authorize(function(){
                    self.method.call(self, method, function(data, response){
                        // Check if we have to wrap data into a model
                        if (_.isFunction(callback)) {
                            callback(data, response);
                        }
                        resolve(data, response);
                    }, options)
                });
            });
        }

        /**
         * Extend default request options with custom ones, if present
         */
        var requestOptions = _.extend({}, this.requestOptions, options);

        /**
         * If we have custom headers, we have to prevent them to override Authentication header
         */
        if (options && options.headers) {
            _.extend(requestOptions.headers, this.requestOptions.headers, options.headers);
        }

        /**
         * Append the path placeholders in order to build the proper url for the request
         */
        if (options && options.path) {
            _.extend(requestOptions.path, this.requestOptions.path, options.path);
        }

        return new Promise(function(resolve, reject){
            var request;
            // Allow consumers to perform a direct request if needed
            if (method === 'post' || method === 'get' || method === 'put') {

                if (!requestOptions.url) throw new Error('url must be specified when doing a manual request');

                request = self.client[method](requestOptions.url, requestOptions, function(data, response){
                    if (response.statusCode === 401) {
                        // Authorization error
                        self.authorize(function(){
                            self.method.call(self, method, function(data, response){
                                // Check if we have to wrap data into a model
                                if (_.isFunction(callback)) {
                                    callback(data, response);
                                }
                                resolve(data, response);
                            }, options)
                        });
                    } else if (response.statusCode < 200 || response.statusCode > 299) {
                        if (_.isFunction(callback)) callback(data, response);
                        resolve(data.Message);
                        self.errorHandler(data.Message, data);
                    } else {
                        if (_.isFunction(callback)) {
                            callback(data, response);
                        }
                        resolve(data, response);
                    }
                });
            } else {
                request = self.client.methods[method](requestOptions, function(data, response){
                    if (response.statusCode === 401) {
                        // Authorization error
                        self.authorize(function(){
                            self.method.call(self, method, function(data, response){
                                // Check if we have to wrap data into a model
                                if (_.isFunction(callback)) {
                                    callback(data, response);
                                }
                                resolve(data, response);
                            }, options)
                        });
                    } else if (response.statusCode < 200 || response.statusCode > 299) {
                        if (_.isFunction(callback)) callback(data, response);
                        resolve(data, response);
                        self.errorHandler(data.Message, data);
                    } else {
                        /**
                         * Add raw response data under 'data' property of the object and at the root of the object
                         */
                        _.extend(options.data, data, {data: data});

                        /**
                         * Check if we have to instantiate returned data
                         */
                        if (options.dataClass) {
                            if (_.isArray(data)) {
                                data = _.map(data, function(dataItem) {
                                    return new options.dataClass(dataItem);
                                })
                            } else {
                                data = new options.dataClass(data);
                            }
                        }
                        if (_.isFunction(callback)) {
                            callback(data, response);
                        }
                        resolve(data, response);
                    }
                });
            }

            // Generic error handler
            request.on('error', function(err){
                resolve(err);
                self.errorHandler('Request error', err);
            });
        });
    },

    buildRequestData: function(entity) {
        var self = this;

        var blackList = entity.getReadOnlyProperties();
        var requestDataKeys = _.difference(_.keys(entity), blackList);
        var requestData = _.pick(entity, requestDataKeys);

        _.each(_.keys(entity), function(key){
            if (self.canReadSubRequestData(entity, key)) {
                _.extendOwn(requestData, entity[key].toJSON());
            }
        });

        return requestData;
    },

    canReadSubRequestData: function(entity, propertyName) {
        if (entity instanceof this.models.PayIn && (propertyName === 'PaymentDetails' || propertyName === 'ExecutionDetails')) {
            return true;
        }

        if (entity instanceof this.models.PayOut && propertyName === 'MeanOfPaymentDetails') {
            return true;
        }

        if (entity instanceof this.models.BankAccount && propertyName === 'Details') {
            return true;
        }

        return false;
    },

    /**
     * OAuth2 authorization mechanism. After authorization request, calls the callback with returned authorization data
     * @param {function}    callback
     * @returns {object} request promise
     */
    authorize: function(callback) {
        var self = this;

        return this.client.methods.authentication_oauth({
            data: {
                grant_type: 'client_credentials'
            },
            headers: {
                'Authorization': _getBasicAuthHash(this.config.clientId, this.config.clientPassword),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }, function(data) {
            _.extend(self.requestOptions.headers, {
                Authorization: data.token_type + ' ' + data.access_token
            });
            // Multiplying expires_in (seconds) by 1000 since JS getTime() is expressed in ms
            self.authorizationExpireTime = new Date().getTime() + ( data.expires_in * 1000 );
            callback(data);
        });
    },

    isExpired: function() {
        // Expressed in ms ( 10 seconds )
        var THRESHOLD = 10000;
        return (new Date().getTime() - THRESHOLD) > this.authorizationExpireTime;
    },

    /**
     * Populates the SDK object with the services
     */
    _servicesLoader: function() {
        var self = this;
        // Read all files from ./services and add them to this object
        // ex: services/User.js becomes mangopay.Users
        var servicesRoot = path.join(__dirname, 'services');
        fs.readdirSync(servicesRoot).forEach(function (file) {
            var serviceName = file.match(/(.*)\.js/)[1];
            var ServiceClass = require(servicesRoot + '/' + file);
            self[serviceName] = new ServiceClass();
            self[serviceName]._api = self;
        });

        // Read all files from ./models and add them to this object
        // ex: models/User.js becomes mangopay.models.User
        var modelsRoot = path.join(__dirname, 'models');
        self.models = {};
        fs.readdirSync(modelsRoot).forEach(function (file) {
            var modelName = file.match(/(.*)\.js/)[1];
            self.models[modelName] = require(modelsRoot + '/' + file);
        });
    }
};

module.exports = Api;