var expect = require('chai').expect;

describe('Nested models', function () {
    var Model = require('./models/with-nested');
    describe('model field', function () {
        var data, model;
        beforeEach(function () {
            data = {
                nested: {
                    a: 'a-0',
                    b: 'b-0',
                    invalid: 0
                }
            };
            model = new Model(data);
            return model.ready();
        });
        it('should serialize to toJSON', function () {
            expect(model.toJSON().nested).to.be.deep.equal(data.nested);
        });
        it('should trigger change on parent model', function (done) {
            model.on('change', function () {
                done();
            });
            model.get('nested').set('a', 'a-1');
        });
        it('should trigger change:field on parent model', function (done) {
            model.on('change:nested', function () {
                done();
            });
            model.get('nested').set('a', 'a-1');
        });
        it('should validate', function (done) {
            model.validate().fail(function () {
                model.get('nested').set('invalid', 1);
                return model.validate().then(function () {
                    done();
                });
            }).done();
        });
        it('isChanged should be false after set same instance', function () {
            model.set('nested', model.get('nested'));
            return model.ready().then(function () {
                expect(model.isChanged()).to.be.equal(false);
            }).done();
        });
        it('isChanged should be true if nested changed', function () {
            model.get('nested').set('a', 'a-1');
            expect(model.isChanged()).to.be.equal(true);
        });
        it('isChanged should be false after revert', function () {
            model.get('nested').set('a', 'a-1');
            model.revert();
            expect(model.isChanged()).to.be.equal(false);
        });
        it('isChanged should be false after commit', function () {
            model.get('nested').set('a', 'a-1');
            model.commit();
            expect(model.isChanged()).to.be.equal(false);
        });
    });
});
