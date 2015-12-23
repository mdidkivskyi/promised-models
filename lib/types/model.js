/**
 * Nested model attribute
 */
var Attribute = require('../attribute'),
    Vow = require('vow'),
    ModelAttribute, ModelAttributeStatic;

/**
 * Attribute with nested model
 * @class {Attribute}
 */
ModelAttribute = Attribute.inherit({

    /**
     * @override {Attribute}
     */
    __constructor: function () {
        this.__base.apply(this, arguments);
        this._bindToModel();
    },

    /**
     * @override {Attribute}
     */
    isSet: function () {
        throw new Error('.isSet is not implemented for nested models');
    },

    /**
     * @override {Attribute}
     */
    unset: function () {
        throw new Error('.unset is not implemented for nested models');
    },

    /**
     * nested model ready
     * @return {Promise}
     */
    ready: function () {
        return this.value.ready();
    },

    /**
     * @override {Attribute}
     */
    validate: function () {
        return this.value.validate().fail(function (modelValidationError) {
            var error = new ModelAttribute.ValidationError();
            error.modelError = modelValidationError;
            return Vow.reject(error);
        }.bind(this));
    },

    /**
     * @override {Attribute}
     */
    isChanged: function () {
        return this.value.isChanged();
    },

    /**
     * @override {Attribute}
     */
    commit: function (branch) {
        var changed = this.value.commit(branch);
        if (changed) {
            this._emitCommit();
        }
        return changed;
    },

    /**
     * @override {Attribute}
     */
    revert: function (branch) {
        return this.value.revert(branch);
    },

    /**
     * @override {Attribute}
     */
    getLastCommitted: function (branch) {
        return this.value.getLastCommitted(branch);
    },

    /**
     * @override {Attribute}
     */
    previous: function () {
        return this.value.previous();
    },

    /**
     * @abstarct
     * @type {Model}
     */
    modelType: null,

    /**
     * @override {Attribute}
     */
    toJSON: function () {
        return this.value.toJSON();
    },

    /**
     * @override {Attribute}
     */
    isEqual: function (value) {
        return this.value === value;
    },

    /**
     * @override {Attribute}
     * set attribute value
     * @param {*} value
     */
    set: function (value) {
        if (value === null) {
            this.unset();
        } else if (!this.isEqual(value)) {
            if (value instanceof this.modelType) {
                this._unbindFromModel();
                this.value = value;
                this._bindToModel();
                this._emitChange();
            } else {
                this.value.set(value);
            }
            this._isSet = true;
        }
    },

    destruct: function () {
        this._unbindFromModel();

        return this.__base.apply(this, arguments);
    },

    /**
     * @override {Attribute}
     */
    _toAttributeValue: function (value) {
        if (value instanceof this.modelType) {
            return value;
        } else {
            return new this.modelType(value);
        }
    },

    _unbindFromModel: function () {
        if (this.value) {
            this.value.un('calculate', this._emitChange, this);
        }
    },

    /**
     * bind to model events
     */
    _bindToModel: function () {
        if (this.value) {
            this.value.on('calculate', this._emitChange, this);
        }
    }

}, {

    ValidationError: (function () {

        /**
         * @param {String} message
         */
        var ValidationError = function (message) {
            Attribute.ValidationError.call(this, message);
            this.name = 'ModelAttributeValidationError';
        };
        ValidationError.prototype = Object.create(Attribute.ValidationError.prototype);
        ValidationError.constructor = ValidationError;
        return ValidationError;
    })()
});

/**
 * Static constructor for ModelAttribute
 * @class
 */
ModelAttributeStatic = function (value) {
    if (this instanceof ModelAttributeStatic) {
        return new ModelAttribute(value);
    } else {
        return ModelAttribute.inherit({
            modelType: value
        });
    }
};
ModelAttributeStatic.inherit = ModelAttribute.inherit.bind(ModelAttribute);
ModelAttributeStatic.ValidationError = ModelAttribute.ValidationError;
module.exports = ModelAttributeStatic;
