var _ = require('underscore');
var Service = require('../service');
var DisputeDocument = require('../models/DisputeDocument');

var DisputeDocuments = Service.extend({
    /**
     * Gets dispute's document
     * @param {number}  documentId  Document identifier
     * @param callback
     * @param options
     * @returns {Object}            Request promise
     */
    get: function(documentId, callback, options) {
        options = this._api._getOptions(callback, options, {
            path: {
                id: documentId
            },
            dataClass: DisputeDocument
        });

        return this._api.method('disputes_document_get', callback, options);
    },

    /**
     * Gets dispute's documents for client
     * @param callback
     * @param options
     * @returns {Object}        Request promise
     */
    getAll: function(callback, options) {
        options = this._api._getOptions(callback, options, {
            dataClass: DisputeDocument
        });

        return this._api.method('disputes_document_all', callback, options);
    }
});

module.exports = DisputeDocuments;