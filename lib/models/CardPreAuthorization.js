var _ = require('underscore');
var Model = require('../model');
var Money = require('./Money');

var CardPreAuthorization = Model.extend({
    defaults: {
        AuthorId: null,

        /**
         * It represents the amount debited on the bank account
         * of the Author.DebitedFunds = Fees + CreditedFunds
         * (amount received on wallet)
         */
        DebitedFunds: null,

        /**
         * Status of the PreAuthorization: CREATED, SUCCEEDED, FAILED
         */
        Status: null,

        /**
         * The status of the payment after the PreAuthorization:
         * WAITING, CANCELED, EXPIRED, VALIDATED
         */
        PaymentStatus: null,

        ResultCode: null,
        ResultMessage: null,

        /**
         * How the PreAuthorization has been executed.
         * Only on value for now: CARD
         */
        ExecutionType: null,

        /**
         * The SecureMode correspond to '3D secure' for CB Visa and MasterCard
         * or 'Amex Safe Key' for American Express.
         * This field lets you activate it manually.
         */
        SecureMode: null,

        /**
         * The ID of the registered card (Got through CardRegistration object)
         */
        CardId: null,

        /**
         * Boolean. The value is 'true' if the SecureMode was used
         */
        SecureModeNeeded: null,

        /**
         * This is the URL where to redirect users to proceed
         * to 3D secure validation
         */
        SecureModeRedirectURL: null,

        /**
         * This is the URL where users are automatically redirected
         * after 3D secure validation (if activated)
         */
        SecureModeReturnURL: null,
        /**
         * The date when the payment is processed
         */
        ExpirationDate: null,
        /**
         * The date when the payment was authorized
         */
        AuthorizationDate: null,
        /**
         * The type of pre-authorization ("CARD" is the only acceptable value at present
         */
        PaymentType: null,
        PayInId: null

    },

    getSubObjects: function() {
        return {
            'DebitedFunds': Money
        }
    },

    getReadOnlyProperties: function() {
        var properties = Model.prototype.getReadOnlyProperties();
        properties.push('Status', 'ResultCode', 'ResultMessage');
        return properties;
    }
});

module.exports = CardPreAuthorization;