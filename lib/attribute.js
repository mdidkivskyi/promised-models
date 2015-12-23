
var Inheritable = require('./inheritable'),
    Vow = require('vow'),
    fulfill = require('./fulfill');

/**
 * Model attribute
 * @class Attribute
 * @extends Inheritable
 */
var Attribute = Inheritable.inherit(/** @lends Attribute.prototype */{

    DEFAULT_BRANCH: 'DEFAULT_BRANCH',

    PREVIOUS_BRANCH: 'PREVIOUS_BRANCH',

    /**
     * @param {*} initValue
     */
    __constructor: function (name, model, initValue) {
        var setValue;
        this._cachBranches = {};
        this._cachIsSetBranches = {};
        this.name = name;
        this.model = model;
        if (initValue === undefined || initValue === null) {
            this._isSet = false;
            setValue = this._callOrGetDefault();
        } else {
            this._isSet = true;
            setValue = initValue;
        }
        this.value = this._toAttributeValue(setValue);
        this._changed = true;
        // @fixme: is it necessary?
        this.commit();
    },

    /**
     * check if attribute was set
     * @param  {string} attributeName
     * @return {Boolean}
     */
    isSet: function () {
        return this._isSet;
    },

    /**
     * set attribute to default value
     * @param  {string} attributeName
     */
    unset: function () {
        this.set(this._callOrGetDefault());
        this._isSet = false;
    },

    /**
     * check if attribute is valid
     * @abstract
     * @return {Promise}
     */
    validate: function () {
        var error = this.getValidationError();
        if (!error) {
            return fulfill(true);
        } else {
            return Vow.reject(error);
        }
    },

    /**
     * Helper method for attribute validation.
     * Attribute is not valid if it will return non-falsy value
     * @abstract
     * @returns {*}
     */
    getValidationError: function () { },

    /**
     * return serializable value of attribute
     * @return {*}
     */
    toJSON: function () {
        return this.get();
    },

    /**
     * check value to be equal to attribute value
     * @param  {*}  value
     * @return {Boolean}
     */
    isEqual: function (value) {
        return this.value === this._toAttributeValue(value);
    },

    /**
     * check if attribute was changed after last commit
     * @prop {string} [branch=DEFAULT_BRANCH]
     * @return {Boolean}
     */
    isChanged: function (branch) {
        return this._changed;

        branch = branch || this.DEFAULT_BRANCH;
        // @fixme
        return !this.isEqual(this._cachBranches[branch]);
    },

    /**
     * revert attribute value to initial or last commited
     */
    revert: function () {
        if (this.isChanged()) {
            this.commit(this.PREVIOUS_BRANCH);
            this.value = this._cachBranches[this.DEFAULT_BRANCH];
            this._isSet = this._cachIsSetBranches[this.DEFAULT_BRANCH];
            this._changed = false;
            this._emitChange();
        }
    },

    /**
     * prevent current value to be rolled back
     * @prop {string} [branch=DEFAULT_BRANCH]
     * @return {boolean}
     */
    commit: function (branch) {
        if (this.isChanged()) {
            branch = branch || this.DEFAULT_BRANCH;
            this._cachBranches[branch] = this.value;
            this._cachIsSetBranches[branch] = this._isSet;
            if (branch === this.DEFAULT_BRANCH) {
                this._changed = false;
                this._emitCommit();
            }

            return true;
        }

        return false;
    },

    /**
     * @abstruct
     */
    destruct: function () {},

    /**
     * @param {string} [branch=DEFAULT_BRANCH]
     * @returns {*}
     */
    getLastCommitted: function (branch) {
        branch = branch || this.DEFAULT_BRANCH;
        return this._fromAttributeValue(this._cachBranches[branch]);
    },

    /**
     * @returns {*}
     */
    previous: function () {
        return this.getLastCommitted(this.PREVIOUS_BRANCH);
    },

    /**
     * set attribute value
     * @param {*} value
     */
    set: function (value) {
        if (!this.isEqual(value)) {
            if (value === null) {
                this.unset();
            } else {
                this._changed = true;
                this.commit(this.PREVIOUS_BRANCH);
                this.value = this._toAttributeValue(value);
                this._isSet = true;
                this._emitChange();
            }
        }
    },

    /**
     * get attribute value
     * @return {*}
     */
    get: function () {
        if (arguments.length > 0) {
            throw new Error('Attribute.get() supports no arguments');
        }
        return this._fromAttributeValue(this.value);
    },

    /**
     * Convert value to attribute type
     * @abstract
     * @prop {*} value
     * @return {*}
     */
    _toAttributeValue: function () {
        throw new Error('Not implemented');
    },

    /**
     * @deprecated
     * @returns {*}
     */
    parse: function () {
        return this._toAttributeValue.apply(this, arguments);
    },

    /**
     * @param {*} value
     * @returns {*}
     */
    _fromAttributeValue: function (value) {
        return value;
    },

    /**
     * Calculate new attribute value
     * @function
     * @name Attribute#calculate
     * @return {Promise<{*}>|*} attribute value
     */

    /**
     * Change other attributes value from  current attribute
     * @function
     * @name Attribute#amend
     */
    _emitChange: function () {
        return this.model._onAttributeChange(this);

        this.model.calculate(this);
    },

    /**
     * @param {String} [branch=DEFAULT_BRANCH]
     */
    _emitCommit: function (branch) {
        return this.model._onAttributeCommit(this);
    },

    _callOrGetDefault: function () {
        return typeof this.default === 'function' ? this.default() : this.default;
    }

}, {

    ValidationError: (function () {

        /**
         * @param {String} message
         */
        var ValidationError = function (message) {
            this.name = 'AttributeValidationError';
            this.message = message;
            Error.call(this);
            if (Error.captureStackTrace) {
                Error.captureStackTrace(this, this.constructor);
            } else {
                this.stack = (new Error()).stack;
            }
        };
        ValidationError.prototype = Object.create(Error.prototype);
        ValidationError.prototype.constructor = ValidationError;
        return ValidationError;
    })()
});

module.exports = Attribute;
