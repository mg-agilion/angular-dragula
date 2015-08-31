'use strict';

var dragula = require('dragula');
var dragulaKey = '$$dragula';
var replicateEvents = require('./replicate-events');

function register(angular) {
    return [function dragulaService() {

        var convertModelFunc = passThroughFunc,
            draggedModel,
            droppedModel;

        return {
            add: add,
            find: find,
            options: setOptions,
            destroy: destroy,
            draggedModel: getDraggedModel,
            droppedModel: getDroppedModel,
            convertModel: convertModel
        };

        function handleModels(scope, drake) {
            var dragElm;
            var dragIndex;
            var dropIndex;
            var sourceModel,
                sourceParentModel;

            drake.on('remove', function removeModel(el, source) {
                sourceModel = drake.models[drake.containers.indexOf(source)];
                sourceParentModel = drake.parentModels[drake.containers.indexOf(source)];
                scope.$applyAsync(function () {
                    var removedModels = sourceModel.splice(dragIndex, 1);
                    drake.emit('remove-model', removedModels[0], sourceModel, sourceParentModel, dragIndex);
                });
            });

            drake.on('drag', function (el, source) {
                dragElm = el;
                dragIndex = domIndexOf(el, source);
                scope.$applyAsync(function () {
                    clearModels();
                    sourceModel = drake.models[drake.containers.indexOf(source)];
                    sourceParentModel = drake.parentModels[drake.containers.indexOf(source)];
                    draggedModel = sourceModel[dragIndex];
                    drake.emit('drag-model', draggedModel, sourceModel, sourceParentModel, dragIndex);
                });
            });

            drake.on('cancel', function () {
                scope.$applyAsync(function () {
                    clearModels();
                });
            });

            drake.on('drop', function (dropElm, target, source) {
                dropIndex = domIndexOf(dropElm, target);
                scope.$applyAsync(function () {
                    sourceModel = drake.models[drake.containers.indexOf(source)];
                    sourceParentModel = drake.parentModels[drake.containers.indexOf(source)];
                    var targetModel,
                        targetParentModel;
                    if (target === source) {
                        droppedModel = sourceModel.splice(dragIndex, 1)[0];
                        sourceModel.splice(dropIndex, 0, droppedModel);
                        targetModel = sourceModel;
                        targetParentModel = sourceParentModel;
                    } else {
                        var notCopy = dragElm === dropElm;
                        targetModel = drake.models[drake.containers.indexOf(target)];
                        targetParentModel = drake.parentModels[drake.containers.indexOf(target)];
                        var dropElmModel = notCopy ? draggedModel : angular.copy(draggedModel);
                        droppedModel = convertModelFunc(dropElmModel);
                        if (notCopy) {
                            sourceModel.splice(dragIndex, 1);
                        }
                        targetModel.splice(dropIndex, 0, droppedModel);
                        target.removeChild(dropElm); // element must be removed for ngRepeat to apply correctly
                    }
                    drake.emit('drop-model', droppedModel, sourceModel, sourceParentModel, targetModel, targetParentModel, dropIndex);
                });
            });
        }

        function clearModels() {
            draggedModel = undefined;
            droppedModel = undefined;
        }

        function getOrCreateCtx(scope) {
            var ctx = scope[dragulaKey];
            if (!ctx) {
                ctx = scope[dragulaKey] = {
                    bags: []
                };
            }
            return ctx;
        }

        function domIndexOf(child, parent) {
            return Array.prototype.indexOf.call(angular.element(parent).children(), child);
        }

        function add(scope, name, drake) {
            var bag = find(scope, name);
            if (bag) {
                throw new Error('Bag named: "' + name + '" already exists in same angular scope.');
            }
            var ctx = getOrCreateCtx(scope);
            bag = {
                name: name,
                drake: drake
            };
            ctx.bags.push(bag);
            replicateEvents(angular, bag, scope);
            if (drake.models) { // models to sync with (must have same structure as containers)
                handleModels(scope, drake);
            }
            return bag;
        }

        function find(scope, name) {
            var bags = getOrCreateCtx(scope).bags;
            for (var i = 0; i < bags.length; i++) {
                if (bags[i].name === name) {
                    return bags[i];
                }
            }
        }

        function destroy(scope, name) {
            var bags = getOrCreateCtx(scope).bags;
            var bag = find(scope, name);
            var i = bags.indexOf(bag);
            bags.splice(i, 1);
            bag.drake.destroy();
        }

        function setOptions(scope, name, options) {
            var bag = add(scope, name, dragula(options));
            handleModels(scope, bag.drake);
        }

        function passThroughFunc(passedObject) {
            return passedObject;
        }

        function convertModel(convertFunc) {
            console.log('convertModel');
            console.log(convertFunc);
            convertModelFunc = convertFunc || passThroughFunc;
            console.log(convertModelFunc);
        }

        function getDraggedModel() {
            return draggedModel;
        }

        function getDroppedModel() {
            return droppedModel;
        }
    }];
}

module.exports = register;
