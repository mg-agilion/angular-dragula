'use strict';

var dragula = require('dragula');

/*jshint unused: false*/
function register(angular) {
    return ['dragulaService', function angularDragula(dragulaService) {
        return {
            restrict: 'A',
            scope: {
                dragulaScope: '=',
                dragulaModel: '=',
                dragulaParentModel: '='
            },
            link: link
        };

        function link(scope, elem, attrs) {
            var dragulaScope = scope.dragulaScope || scope.$parent;
            var container = elem[0];
            var name = scope.$eval(attrs.dragula);
            var model = scope.dragulaModel;
            var parentModel = scope.dragulaParentModel;
            var bag = dragulaService.find(dragulaScope, name);
            if (bag) {
                bag.drake.containers.push(container);
                if (model) {
                    if (bag.drake.models) {
                        bag.drake.models.push(model);
                        bag.drake.parentModels.push(parentModel);
                    } else {
                        bag.drake.models = [model];
                        bag.drake.parentModels = [parentModel];
                    }
                }
                return;
            }
            var drake = dragula({
                containers: [container]
            });
            if (model) {
                drake.models = [model];
                drake.parentModels = [parentModel];
            }
            dragulaService.add(dragulaScope, name, drake);
        }
    }];
}

module.exports = register;
