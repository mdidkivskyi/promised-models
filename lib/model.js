/**
 * Promised models
 */

var Events = require('./events'),
    Vow = require('vow'),
    uniq = require('./uniq'),
    IdAttribute = require('./types/id'),
    Attribute = require('./attribute'),
    fulfill = require('./fulfill'),

    /**
     * @class Model
     * @extends Events
     */
    Model = Events.inherit(/** @lends Model.prototype */{

        /**
         * @deprecated use getId method
         */
        id: null,

        /**
         * @param {*} [id]
         * @param {Object} [data] initial data
         * @param {Object} [options]
         */
        __constructor: function (data, options) {
            var Storage, attributesNames, i, n, attrName, Attribute, modelAttrsDecl;

            this.__base.apply(this, arguments);

            data || (data = {});
            options || (options = {});
            Storage = options.storage || this.storage;

            if (options.collection) {
                this.collection = options.collection;
            }

            this._ready = true;
            this._readyPromise = fulfill();
            this.storage = Storage ? new Storage() : null;

            attributesNames = Object.keys(this.attributes || {});
            this._attributesAr = [];
            modelAttrsDecl = this.attributes;
            this.attributes = {};
            this._triggerChangeAttrs = {};
            this._calculationDepth = 0;
            this._changed = {};

            for (i = 0, n = attributesNames.length; i < n; i++) {
                attrName = attributesNames[i];
                Attribute = modelAttrsDecl[attrName];

                this.attributes[attrName] = new Attribute(attrName, this, data[attrName]);
                if (this.attributes[attrName] instanceof IdAttribute) {
                    this.idAttribute = this.attributes[attrName];
                }
                this._attributesAr.push(this.attributes[attrName]);
                /*this._triggerChangeAttrs[attrName] = true;*/
            }

            this.calculate();
        },

        /**
         * @returns {*}
         */
        getId: function () {
            return this.idAttribute ? this.idAttribute.get() : null;
        },

        /**
         * set attribute to default value
         * @param  {string} attributeName
         */
        unset: function (attributeName) {
            this._throwMissedAttribute(attributeName);
            this.attributes[attributeName].unset();
        },

        /**
         * check if attribute was set
         * @param  {string} attributeName
         * @return {Boolean}
         */
        isSet: function (attributeName) {
            this._throwMissedAttribute(attributeName);
            return this.attributes[attributeName].isSet();
        },

        /**
         * when false calculation errors will be silent
         * @type {Boolean}
         */
        throwCalculationErrors: true,

        /**
         * if model was synced with storage
         * @return {Boolean}
         */
        isNew: function () {
            return this.getId() === null;
        },

        /**
         * save model changes
         * @return {Promise}
         */
        save: function () {
            var model = this;
            if (!model.idAttribute) {
                throw new Error('model without declared perisitent id attribute cat not be saved');
            }
            if (!this.storage) {
                this._throwStorageRequired()
            }

            return this._rejectDestructed().then(function () {
                if (model.isNew()) {
                    return model.ready().then(function () {
                        return model.storage.insert(model);
                    }).then(function (id) {
                        model.idAttribute.set(id);
                        model.commit();
                        model.calculate();
                        return model.ready();
                    });
                } else {
                    return model.ready().then(function () {
                        return model.storage.update(model);
                    }).then(function () {
                        model.commit();
                    });
                }
            });
        },

        /**
         * fetch model from storage
         * @return {Promise}
         */
        fetch: function () {
            var model = this;
            if (!model.idAttribute) {
                throw new Error('model can not be fetched from persistent storage, if it has no persistent id');
            }
            if (!this.storage) {
                this._throwStorageRequired()
            }

            return this.ready().then(function () {
                return model.storage.find(model);
            }).then(function (data) {
                model.set(data);
                return model.ready();
            }).then(function () {
                model.commit();
            });
        },

        /**
         * remove model from storage and destruct it
         * @return {Promise}
         */
        remove: function () {
            var model = this;
            if (model.isNew()) {
                model.destruct();
                return fulfill();
            } else {
                if (!model.idAttribute) {
                    throw new Error('model can not be removed from persistet storage, if it has no persistent id');
                }
                if (!this.storage) {
                    this._throwStorageRequired()
                }

                return fulfill().then(function () {
                    return model.storage.remove(model);
                }).then(function () {
                    model.destruct();
                });
            }
        },

        /**
         * check of model destruted
         * @return {Boolean}
         */
        isDestructed: function () {
            return Boolean(this._isDestructed);
        },

        /**
         * destruct model instance
         */
        destruct: function () {
            this._isDestructed = true;
            this.trigger('destruct');
            this._eventEmitter.removeAllListeners();
            this._attributesAr.forEach(function (attribute) {
                attribute.destruct();
            });
        },


        /**
         * check if model is valid
         * @return {Promise<Boolean, Model.ValidationError>}
         */
        validate: function () {
            var model = this;
            return model.ready().then(function () {
                return Vow.allResolved(model._attributesAr.map(function (attribute) {
                    return attribute.validate();
                }));
            }).then(function (validationPromises) {
                var errors = [],
                    error;

                validationPromises.forEach(function (validationPromise, index) {
                    var validationResult, error;

                    if (validationPromise.isFulfilled()) {
                        return;
                    }

                    validationResult = validationPromise.valueOf();

                    if (validationResult instanceof Error) {
                        error =  validationResult;
                    } else {
                        error = new Attribute.ValidationError();

                        if (typeof validationResult === 'string') {
                            error.message = validationResult;
                        } else if (typeof validationResult !== 'boolean') {
                            error.data = validationResult;
                        }
                    }

                    error.attribute = model._attributesAr[index];

                    errors.push(error);
                });

                if (errors.length) {
                    error = new model.__self.ValidationError();
                    error.attributes = errors;
                    return Vow.reject(error);
                } else {
                    return fulfill(true);
                }
            });
        },

        /**
         * check if any attribute is changed
         * @prop {string} [branch=DEFAULT_BRANCH]
         * @return {Boolean}
         */
        isChanged: function (branch) {
            return this._attributesAr.some(function (attr) {
                return attr.isChanged();
            });
        },

        /**
         * revert all attributes to initial or last commited value
         * @prop {string} [branch=DEFAULT_BRANCH]
         */
        revert: function () {
            this._attributesAr.forEach(function (attr) {
                attr.revert();
            });

            return this;
        },

        /**
         * commit current value, to not be rolled back
         * @prop {string} [branch=DEFAULT_BRANCH]
         * @return {boolean}
         */
        commit: function (branch) {
            var changed = false;

            this._attributesAr.forEach(function (attr) {
                changed = attr.commit(branch) || changed;
            });
            if (changed) {
                this.trigger('commit');
            }

            return changed;
        },

        /**
         * @param {string} [branch=DEFAULT_BRANCH]
         * @returns {Object}
         */
        getLastCommitted: function (branch) {
            return this._getSerializedData('getLastCommitted', branch);
        },

        /**
         * @param {String} [attr] - if not defined returns all attributes
         * @returns {*}
         */
        previous: function (attr) {
            if (arguments.length) {
                return this.attributes[attr].previous();
            } else {
                return this._getSerializedData('previous');
            }
        },

        /**
         * set attribute value
         * @param {string|object} name or data
         * @param {*} value
         * @return {Boolean} if attribute found
         */
        set: function (name, value) {
            var data;

            if (arguments.length === 1) {
                data = name;
                Object.keys(data).forEach(function (name) {
                    if (data[name] !== undefined) {
                        this.set(name, data[name]);
                    }
                }, this);
            } else if (this.attributes[name]) {
                this.attributes[name].set(value);
            }

            return this;
        },

        /**
         * get attribute value
         * @param  {string} attributeName
         * @return {*}
         */
        get: function (attributeName) {
            this._throwMissedAttribute(attributeName);
            return this.attributes[attributeName].get();
        },

        /**
         * return model data
         * @return {object}
         */
        toJSON: function () {
            return this._getSerializedData('toJSON');
        },

        /**
         * if all calculations are done
         * @return {Boolean}
         */
        isReady: function () {
            return this._ready;
        },

        /**
         * wait for all calculations to be done
         * @return {Promise}
         */
        ready: function () {
            return this._readyPromise;
        },

        /**
         * make all calculations for attributes
         * @return {Promise}
         */
        calculate: function () {
            var model = this;

            if (this.isReady()) {
                this._ready = false;
                //start _calculate on next tick
                this._readyPromise = fulfill().then(function () {
                    return model._calculate();
                });
                this._readyPromise.fail(function (e) {
                    console.error(e, e && e.stack)
                    model._ready = true;
                });

                this.trigger('calculate');
            }
            if (this.throwCalculationErrors) {
                return this._readyPromise;
            } else {
                return this._readyPromise.always(function () {
                    return fulfill();
                });
            }
        },

        /**
         * @returns {Model}
         */
        trigger: function (event, a1, a2, a3) {
            return this.__base(event, this, a1, a2, a3);
        },

        /**
         * to prevent loop calculations we limit it
         * @type {Number}
         */
        maxCalculations: 100,

        /**
         * @return {Promise}
         */
        _rejectDestructed: function () {
            if (this.isDestructed()) {
                return Vow.reject(new Error ('Model is destructed'));
            } else {
                return fulfill();
            }
        },

        _throwMissedAttribute: function (attributeName) {
            if (!this.attributes[attributeName]) {
                throw new Error('Unknown attribute ' + attributeName);
            }
        },

        /**
         * @param {('toJSON'|'getLastCommitted'|'previous')} serializeMethod
         * @param {...*} [args]
         * @returns {Object}
         */
        _getSerializedData: function (serializeMethod, a) {
            var model = this,
                args = Array.prototype.slice.call(arguments, 1);

            return Object.keys(this.attributes).filter(function (name) {
                return !model.attributes[name].internal;
            }).reduce(function (data, name) {
                var attribute = model.attributes[name];
                data[name] = attribute[serializeMethod].apply(attribute, args);
                return data;
            }, {});

            return result;
        },

        _calculate: function () {
            var calculatePromises = {},
                otherPromises = [],
                hasCalulationPromises = false,
                changed, fnResult;

            this._checkCalculationDepthLimit();
            changed = this._changed,
            this._changed = {};
            this._attributesAr.forEach(function (attr) {
                if (attr.calculate) {
                    fnResult = attr.calculate();
                    if (Vow.isPromise(fnResult)) {
                        calculatePromises[attr.name] = fnResult;
                        hasCalulationPromises = true;
                    } else if (fnResult !== undefined) {
                        attr.set(fnResult);
                    }
                }

                if (attr.amend && changed.hasOwnProperty(attr.name)) {
                    fnResult = attr.amend();
                    if (Vow.isPromise(fnResult)) {
                        otherPromises.push(fnResult);
                    }
                }

                if (attr.ready) {
                    fnResult = attr.ready();
                    if (!Vow.isFulfilled(fnResult)) {
                        otherPromises.push(fnResult);
                    }
                }
            });

            if (otherPromises.length || hasCalulationPromises) {
                return Vow.all([
                    Vow.all(calculatePromises),
                    Vow.all(otherPromises)
                ])
                .spread(function (calculatedData) {
                    this.set(calculatedData);
                    return this._afterCalculate();
                }.bind(this));
            }

            return this._afterCalculate();
        },

        _checkCalculationDepthLimit: function () {
            if (++ this._calculationDepth > this.maxCalculations) {
                throw new Error(
                    'After ' +
                    this.maxCalculations +
                    ' calculations fileds ' +
                    Object.keys(this._changed) +
                    ' still changed'
                );
            }
        },

        _afterCalculate: function () {
            if (Object.keys(this._changed).length) {
                return this._calculate();
            }

            return this._triggerChanged();
        },

        _onAttributeChange: function (attr) {
            this._changed[attr.name] = attr;
            this._triggerChangeAttrs[attr.name] = true;
            this.calculate();
        },

        _triggerChanged: function () {
            this._ready = true;
            this._calculationDepth = 0;
            Object.keys(this._triggerChangeAttrs).forEach(function (attrName) {
                this.trigger('change:' + attrName);
            }, this);
            this._triggerChangeAttrs = {};
            this.trigger('change');
        },

        _onAttributeCommit: function (attr) {
            this.trigger('commit:' + attr.name);
        },

        _throwStorageRequired: function () {
            throw new Error('Storage is required');
        }

    }, {

        /**
         * @override
         */
        inherit: function (props, staticProps) {
            staticProps = staticProps || {};
            staticProps.attributes = staticProps.attributes || props.attributes;
            staticProps.storage = staticProps.storage || props.storage;
            return this.__base(props, staticProps);
        },

        /**
         * @class
         * @abstract
         */
        Storage: require('./storage'),

        attributeTypes: {
            Id: IdAttribute,
            String: require('./types/string'),
            Number: require('./types/number'),
            Boolean: require('./types/boolean'),
            List: require('./types/list'),
            Model: require('./types/model'),
            ModelsList: require('./types/models-list'),
            Collection: require('./types/collection'),
            Object: require('./types/object')
        },

        /**
         * @type {Attribute}
         * @prop {*} [initValue]
         */
        Attribute: require('./attribute'),

        Collection: require('./collection'),

        /**
         * @class <{Error}>
         * @prop {Array<{Attribute}>} attributes
         */
        ValidationError: (function () {
            var ValidationError = function () {
                this.name = 'ValidationError';
                this.attributes = [];
                Error.call(this); //super constructor
                if (Error.captureStackTrace) {
                    Error.captureStackTrace(this, this.constructor);
                } else {
                    this.stack = (new Error()).stack;
                }

            };
            ValidationError.prototype = Object.create(Error.prototype);
            ValidationError.prototype.constructor = ValidationError;
            return ValidationError;
        }())

    });

module.exports = Model;
