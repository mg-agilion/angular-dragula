(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.angularDragula = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

var dragulaService = require('./service');
var dragulaDirective = require('./directive');

function register (angular) {
  var app = angular.module('dragula', ['ng']);

  app.factory('dragulaService', dragulaService(angular));
  app.directive('dragula', dragulaDirective(angular));

  return 'dragula';
}

module.exports = register;

},{"./directive":2,"./service":13}],2:[function(require,module,exports){
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
                dragulaData: '='
            },
            link: link
        };

        function link(scope, elem, attrs) {
            var dragulaScope = scope.dragulaScope || scope.$parent;
            var container = elem[0];
            var name = scope.$eval(attrs.dragula);
            var model = scope.dragulaModel;
            var data = scope.dragulaData;
            var bag = dragulaService.find(dragulaScope, name);
            if (bag) {
                bag.drake.containers.push(container);
                if (model) {
                    if (bag.drake.models) {
                        bag.drake.models.push(model);
                        bag.drake.data.push(data);
                    } else {
                        bag.drake.models = [model];
                        bag.drake.data = [data];
                    }
                }
                return;
            }
            var drake = dragula({
                containers: [container]
            });
            if (model) {
                drake.models = [model];
                drake.data = [data];
            }
            dragulaService.add(dragulaScope, name, drake);
        }
    }];
}

module.exports = register;

},{"dragula":5}],3:[function(require,module,exports){
module.exports = function atoa (a, n) { return Array.prototype.slice.call(a, n); }

},{}],4:[function(require,module,exports){
'use strict';

var cache = {};
var start = '(?:^|\\s)';
var end = '(?:\\s|$)';

function lookupClass (className) {
  var cached = cache[className];
  if (cached) {
    cached.lastIndex = 0;
  } else {
    cache[className] = cached = new RegExp(start + className + end, 'g');
  }
  return cached;
}

function addClass (el, className) {
  var current = el.className;
  if (!current.length) {
    el.className = className;
  } else if (!lookupClass(className).test(current)) {
    el.className += ' ' + className;
  }
}

function rmClass (el, className) {
  el.className = el.className.replace(lookupClass(className), ' ').trim();
}

module.exports = {
  add: addClass,
  rm: rmClass
};

},{}],5:[function(require,module,exports){
(function (global){
'use strict';

var emitter = require('contra/emitter');
var crossvent = require('crossvent');
var classes = require('./classes');

function dragula (initialContainers, options) {
  var len = arguments.length;
  if (len === 1 && Array.isArray(initialContainers) === false) {
    options = initialContainers;
    initialContainers = [];
  }
  var body = document.body;
  var documentElement = document.documentElement;
  var _mirror; // mirror image
  var _source; // source container
  var _item; // item being dragged
  var _offsetX; // reference x
  var _offsetY; // reference y
  var _initialSibling; // reference sibling when grabbed
  var _currentSibling; // reference sibling now
  var _copy; // item used for copying
  var _renderTimer; // timer for setTimeout renderMirrorImage
  var _lastDropTarget = null; // last container item was over
  var _grabbed; // holds mousedown context until first mousemove

  var o = options || {};
  if (o.moves === void 0) { o.moves = always; }
  if (o.accepts === void 0) { o.accepts = always; }
  if (o.invalid === void 0) { o.invalid = invalidTarget; }
  if (o.containers === void 0) { o.containers = initialContainers || []; }
  if (o.isContainer === void 0) { o.isContainer = never; }
  if (o.copy === void 0) { o.copy = false; }
  if (o.revertOnSpill === void 0) { o.revertOnSpill = false; }
  if (o.removeOnSpill === void 0) { o.removeOnSpill = false; }
  if (o.direction === void 0) { o.direction = 'vertical'; }
  if (o.mirrorContainer === void 0) { o.mirrorContainer = body; }

  var drake = emitter({
    containers: o.containers,
    start: manualStart,
    end: end,
    cancel: cancel,
    remove: remove,
    destroy: destroy,
    dragging: false
  });

  if (o.removeOnSpill === true) {
    drake.on('over', spillOver).on('out', spillOut);
  }

  events();

  return drake;

  function isContainer (el) {
    return drake.containers.indexOf(el) !== -1 || o.isContainer(el);
  }

  function events (remove) {
    var op = remove ? 'remove' : 'add';
    touchy(documentElement, op, 'mousedown', grab);
    touchy(documentElement, op, 'mouseup', release);
  }

  function eventualMovements (remove) {
    var op = remove ? 'remove' : 'add';
    touchy(documentElement, op, 'mousemove', startBecauseMouseMoved);
  }

  function movements (remove) {
    var op = remove ? 'remove' : 'add';
    touchy(documentElement, op, 'selectstart', preventGrabbed); // IE8
    touchy(documentElement, op, 'click', preventGrabbed);
  }

  function destroy () {
    events(true);
    release({});
  }

  function preventGrabbed (e) {
    if (_grabbed) {
      e.preventDefault();
    }
  }

  function grab (e) {
    var ignore = (e.which !== 0 && e.which !== 1) || e.metaKey || e.ctrlKey;
    if (ignore) {
      return; // we only care about honest-to-god left clicks and touch events
    }
    var item = e.target;
    var context = canStart(item);
    if (!context) {
      return;
    }
    _grabbed = context;
    eventualMovements();
    if (e.type === 'mousedown') {
      e.preventDefault(); // fixes https://github.com/bevacqua/dragula/issues/155
      if (item.tagName === 'INPUT' || item.tagName === 'TEXTAREA') {
        item.focus(); // fixes https://github.com/bevacqua/dragula/issues/176
      }
    }
  }

  function startBecauseMouseMoved (e) {
    var grabbed = _grabbed; // call to end() unsets _grabbed
    eventualMovements(true);
    movements();
    end();
    start(grabbed);

    var offset = getOffset(_item);
    _offsetX = getCoord('pageX', e) - offset.left;
    _offsetY = getCoord('pageY', e) - offset.top;

    classes.add(_copy || _item, 'gu-transit');
    renderMirrorImage();
    drag(e);
  }

  function canStart (item) {
    if (drake.dragging && _mirror) {
      return;
    }
    if (isContainer(item)) {
      return; // don't drag container itself
    }
    var handle = item;
    while (item.parentElement && isContainer(item.parentElement) === false) {
      if (o.invalid(item, handle)) {
        return;
      }
      item = item.parentElement; // drag target should be a top element
      if (!item) {
        return;
      }
    }
    var source = item.parentElement;
    if (!source) {
      return;
    }
    if (o.invalid(item, handle)) {
      return;
    }

    var movable = o.moves(item, source, handle);
    if (!movable) {
      return;
    }

    return {
      item: item,
      source: source
    };
  }

  function manualStart (item) {
    var context = canStart(item);
    if (context) {
      start(context);
    }
  }

  function start (context) {
    if (isCopy(context.item, context.source)) {
      _copy = context.item.cloneNode(true);
      drake.emit('cloned', _copy, context.item, 'copy');
    }

    _source = context.source;
    _item = context.item;
    _initialSibling = _currentSibling = nextEl(context.item);

    drake.dragging = true;
    drake.emit('drag', _item, _source);
  }

  function invalidTarget () {
    return false;
  }

  function end () {
    if (!drake.dragging) {
      return;
    }
    var item = _copy || _item;
    drop(item, item.parentElement);
  }

  function ungrab () {
    _grabbed = false;
    eventualMovements(true);
    movements(true);
  }

  function release (e) {
    ungrab();

    if (!drake.dragging) {
      return;
    }
    var item = _copy || _item;
    var clientX = getCoord('clientX', e);
    var clientY = getCoord('clientY', e);
    var elementBehindCursor = getElementBehindPoint(_mirror, clientX, clientY);
    var dropTarget = findDropTarget(elementBehindCursor, clientX, clientY);
    if (dropTarget && (!_copy || dropTarget !== _source)) {
      drop(item, dropTarget);
    } else if (o.removeOnSpill) {
      remove();
    } else {
      cancel();
    }
  }

  function drop (item, target) {
    if (isInitialPlacement(target)) {
      drake.emit('cancel', item, _source);
    } else {
      drake.emit('drop', item, target, _source);
    }
    cleanup();
  }

  function remove () {
    if (!drake.dragging) {
      return;
    }
    var item = _copy || _item;
    var parent = item.parentElement;
    if (parent) {
      parent.removeChild(item);
    }
    drake.emit(_copy ? 'cancel' : 'remove', item, parent);
    cleanup();
  }

  function cancel (revert) {
    if (!drake.dragging) {
      return;
    }
    var reverts = arguments.length > 0 ? revert : o.revertOnSpill;
    var item = _copy || _item;
    var parent = item.parentElement;
    if (parent === _source && _copy) {
      parent.removeChild(_copy);
    }
    var initial = isInitialPlacement(parent);
    if (initial === false && !_copy && reverts) {
      _source.insertBefore(item, _initialSibling);
    }
    if (initial || reverts) {
      drake.emit('cancel', item, _source);
    } else {
      drake.emit('drop', item, parent, _source);
    }
    cleanup();
  }

  function cleanup () {
    var item = _copy || _item;
    ungrab();
    removeMirrorImage();
    if (item) {
      classes.rm(item, 'gu-transit');
    }
    if (_renderTimer) {
      clearTimeout(_renderTimer);
    }
    drake.dragging = false;
    drake.emit('out', item, _lastDropTarget, _source);
    drake.emit('dragend', item);
    _source = _item = _copy = _initialSibling = _currentSibling = _renderTimer = _lastDropTarget = null;
  }

  function isInitialPlacement (target, s) {
    var sibling;
    if (s !== void 0) {
      sibling = s;
    } else if (_mirror) {
      sibling = _currentSibling;
    } else {
      sibling = nextEl(_copy || _item);
    }
    return target === _source && sibling === _initialSibling;
  }

  function findDropTarget (elementBehindCursor, clientX, clientY) {
    var target = elementBehindCursor;
    while (target && !accepted()) {
      target = target.parentElement;
    }
    return target;

    function accepted () {
      var droppable = isContainer(target);
      if (droppable === false) {
        return false;
      }

      var immediate = getImmediateChild(target, elementBehindCursor);
      var reference = getReference(target, immediate, clientX, clientY);
      var initial = isInitialPlacement(target, reference);
      if (initial) {
        return true; // should always be able to drop it right back where it was
      }
      return o.accepts(_item, target, _source, reference);
    }
  }

  function drag (e) {
    if (!_mirror) {
      return;
    }
    e.preventDefault();

    var clientX = getCoord('clientX', e);
    var clientY = getCoord('clientY', e);
    var x = clientX - _offsetX;
    var y = clientY - _offsetY;

    _mirror.style.left = x + 'px';
    _mirror.style.top  = y + 'px';

    var item = _copy || _item;
    var elementBehindCursor = getElementBehindPoint(_mirror, clientX, clientY);
    var dropTarget = findDropTarget(elementBehindCursor, clientX, clientY);
    var changed = dropTarget !== null && dropTarget !== _lastDropTarget;
    if (changed || dropTarget === null) {
      out();
      _lastDropTarget = dropTarget;
      over();
    }
    if (dropTarget === _source && _copy) {
      if (item.parentElement) {
        item.parentElement.removeChild(item);
      }
      return;
    }
    var reference;
    var immediate = getImmediateChild(dropTarget, elementBehindCursor);
    if (immediate !== null) {
      reference = getReference(dropTarget, immediate, clientX, clientY);
    } else if (o.revertOnSpill === true && !_copy) {
      reference = _initialSibling;
      dropTarget = _source;
    } else {
      if (_copy && item.parentElement) {
        item.parentElement.removeChild(item);
      }
      return;
    }
    if (
      reference === null ||
      reference !== item &&
      reference !== nextEl(item) &&
      reference !== _currentSibling
    ) {
      _currentSibling = reference;
      dropTarget.insertBefore(item, reference);
      drake.emit('shadow', item, dropTarget);
    }
    function moved (type) { drake.emit(type, item, _lastDropTarget, _source); }
    function over () { if (changed) { moved('over'); } }
    function out () { if (_lastDropTarget) { moved('out'); } }
  }

  function spillOver (el) {
    classes.rm(el, 'gu-hide');
  }

  function spillOut (el) {
    if (drake.dragging) { classes.add(el, 'gu-hide'); }
  }

  function renderMirrorImage () {
    if (_mirror) {
      return;
    }
    var rect = _item.getBoundingClientRect();
    _mirror = _item.cloneNode(true);
    _mirror.style.width = getRectWidth(rect) + 'px';
    _mirror.style.height = getRectHeight(rect) + 'px';
    classes.rm(_mirror, 'gu-transit');
    classes.add(_mirror, 'gu-mirror');
    o.mirrorContainer.appendChild(_mirror);
    touchy(documentElement, 'add', 'mousemove', drag);
    classes.add(o.mirrorContainer, 'gu-unselectable');
    drake.emit('cloned', _mirror, _item, 'mirror');
  }

  function removeMirrorImage () {
    if (_mirror) {
      classes.rm(o.mirrorContainer, 'gu-unselectable');
      touchy(documentElement, 'remove', 'mousemove', drag);
      _mirror.parentElement.removeChild(_mirror);
      _mirror = null;
    }
  }

  function getImmediateChild (dropTarget, target) {
    var immediate = target;
    while (immediate !== dropTarget && immediate.parentElement !== dropTarget) {
      immediate = immediate.parentElement;
    }
    if (immediate === documentElement) {
      return null;
    }
    return immediate;
  }

  function getReference (dropTarget, target, x, y) {
    var horizontal = o.direction === 'horizontal';
    var reference = target !== dropTarget ? inside() : outside();
    return reference;

    function outside () { // slower, but able to figure out any position
      var len = dropTarget.children.length;
      var i;
      var el;
      var rect;
      for (i = 0; i < len; i++) {
        el = dropTarget.children[i];
        rect = el.getBoundingClientRect();
        if (horizontal && rect.left > x) { return el; }
        if (!horizontal && rect.top > y) { return el; }
      }
      return null;
    }

    function inside () { // faster, but only available if dropped inside a child element
      var rect = target.getBoundingClientRect();
      if (horizontal) {
        return resolve(x > rect.left + getRectWidth(rect) / 2);
      }
      return resolve(y > rect.top + getRectHeight(rect) / 2);
    }

    function resolve (after) {
      return after ? nextEl(target) : target;
    }
  }

  function isCopy (item, container) {
    return typeof o.copy === 'boolean' ? o.copy : o.copy(item, container);
  }
}

function touchy (el, op, type, fn) {
  var touch = {
    mouseup: 'touchend',
    mousedown: 'touchstart',
    mousemove: 'touchmove'
  };
  var microsoft = {
    mouseup: 'MSPointerUp',
    mousedown: 'MSPointerDown',
    mousemove: 'MSPointerMove'
  };
  if (global.navigator.msPointerEnabled) {
    crossvent[op](el, microsoft[type], fn);
  }
  crossvent[op](el, touch[type], fn);
  crossvent[op](el, type, fn);
}

function getOffset (el) {
  var rect = el.getBoundingClientRect();
  return {
    left: rect.left + getScroll('scrollLeft', 'pageXOffset'),
    top: rect.top + getScroll('scrollTop', 'pageYOffset')
  };
}

function getScroll (scrollProp, offsetProp) {
  if (typeof global[offsetProp] !== 'undefined') {
    return global[offsetProp];
  }
  var documentElement = document.documentElement;
  if (documentElement.clientHeight) {
    return documentElement[scrollProp];
  }
  var body = document.body;
  return body[scrollProp];
}

function getElementBehindPoint (point, x, y) {
  var p = point || {};
  var state = p.className;
  var el;
  p.className += ' gu-hide';
  el = document.elementFromPoint(x, y);
  p.className = state;
  return el;
}

function never () { return false; }
function always () { return true; }
function getRectWidth (rect) { return rect.width || (rect.right - rect.left); }
function getRectHeight (rect) { return rect.height || (rect.bottom - rect.top); }

function nextEl (el) {
  return el.nextElementSibling || manually();
  function manually () {
    var sibling = el;
    do {
      sibling = sibling.nextSibling;
    } while (sibling && sibling.nodeType !== 1);
    return sibling;
  }
}

function getEventHost (e) {
  // on touchend event, we have to use `e.changedTouches`
  // see http://stackoverflow.com/questions/7192563/touchend-event-properties
  // see https://github.com/bevacqua/dragula/issues/34
  if (e.targetTouches && e.targetTouches.length) {
    return e.targetTouches[0];
  }
  if (e.changedTouches && e.changedTouches.length) {
    return e.changedTouches[0];
  }
  return e;
}

function getCoord (coord, e) {
  var host = getEventHost(e);
  var missMap = {
    pageX: 'clientX', // IE8
    pageY: 'clientY' // IE8
  };
  if (coord in missMap && !(coord in host) && missMap[coord] in host) {
    coord = missMap[coord];
  }
  return host[coord];
}

module.exports = dragula;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./classes":4,"contra/emitter":7,"crossvent":10}],6:[function(require,module,exports){
'use strict';

var ticky = require('ticky');

module.exports = function debounce (fn, args, ctx) {
  if (!fn) { return; }
  ticky(function run () {
    fn.apply(ctx || null, args || []);
  });
};

},{"ticky":8}],7:[function(require,module,exports){
'use strict';

var atoa = require('atoa');
var debounce = require('./debounce');

module.exports = function emitter (thing, options) {
  var opts = options || {};
  var evt = {};
  if (thing === undefined) { thing = {}; }
  thing.on = function (type, fn) {
    if (!evt[type]) {
      evt[type] = [fn];
    } else {
      evt[type].push(fn);
    }
    return thing;
  };
  thing.once = function (type, fn) {
    fn._once = true; // thing.off(fn) still works!
    thing.on(type, fn);
    return thing;
  };
  thing.off = function (type, fn) {
    var c = arguments.length;
    if (c === 1) {
      delete evt[type];
    } else if (c === 0) {
      evt = {};
    } else {
      var et = evt[type];
      if (!et) { return thing; }
      et.splice(et.indexOf(fn), 1);
    }
    return thing;
  };
  thing.emit = function () {
    var args = atoa(arguments);
    return thing.emitterSnapshot(args.shift()).apply(this, args);
  };
  thing.emitterSnapshot = function (type) {
    var et = (evt[type] || []).slice(0);
    return function () {
      var args = atoa(arguments);
      var ctx = this || thing;
      if (type === 'error' && opts.throws !== false && !et.length) { throw args.length === 1 ? args[0] : args; }
      et.forEach(function emitter (listen) {
        if (opts.async) { debounce(listen, args, ctx); } else { listen.apply(ctx, args); }
        if (listen._once) { thing.off(type, listen); }
      });
      return thing;
    };
  };
  return thing;
};

},{"./debounce":6,"atoa":3}],8:[function(require,module,exports){
var si = typeof setImmediate === 'function', tick;
if (si) {
  tick = function (fn) { setImmediate(fn); };
} else {
  tick = function (fn) { setTimeout(fn, 0); };
}

module.exports = tick;
},{}],9:[function(require,module,exports){
(function (global){

var NativeCustomEvent = global.CustomEvent;

function useNative () {
  try {
    var p = new NativeCustomEvent('cat', { detail: { foo: 'bar' } });
    return  'cat' === p.type && 'bar' === p.detail.foo;
  } catch (e) {
  }
  return false;
}

/**
 * Cross-browser `CustomEvent` constructor.
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent.CustomEvent
 *
 * @public
 */

module.exports = useNative() ? NativeCustomEvent :

// IE >= 9
'function' === typeof document.createEvent ? function CustomEvent (type, params) {
  var e = document.createEvent('CustomEvent');
  if (params) {
    e.initCustomEvent(type, params.bubbles, params.cancelable, params.detail);
  } else {
    e.initCustomEvent(type, false, false, void 0);
  }
  return e;
} :

// IE <= 8
function CustomEvent (type, params) {
  var e = document.createEventObject();
  e.type = type;
  if (params) {
    e.bubbles = Boolean(params.bubbles);
    e.cancelable = Boolean(params.cancelable);
    e.detail = params.detail;
  } else {
    e.bubbles = false;
    e.cancelable = false;
    e.detail = void 0;
  }
  return e;
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],10:[function(require,module,exports){
(function (global){
'use strict';

var customEvent = require('custom-event');
var eventmap = require('./eventmap');
var doc = global.document;
var addEvent = addEventEasy;
var removeEvent = removeEventEasy;
var hardCache = [];

if (!global.addEventListener) {
  addEvent = addEventHard;
  removeEvent = removeEventHard;
}

module.exports = {
  add: addEvent,
  remove: removeEvent,
  fabricate: fabricateEvent
};

function addEventEasy (el, type, fn, capturing) {
  return el.addEventListener(type, fn, capturing);
}

function addEventHard (el, type, fn) {
  return el.attachEvent('on' + type, wrap(el, type, fn));
}

function removeEventEasy (el, type, fn, capturing) {
  return el.removeEventListener(type, fn, capturing);
}

function removeEventHard (el, type, fn) {
  var listener = unwrap(el, type, fn);
  if (listener) {
    return el.detachEvent('on' + type, listener);
  }
}

function fabricateEvent (el, type, model) {
  var e = eventmap.indexOf(type) === -1 ? makeCustomEvent() : makeClassicEvent();
  if (el.dispatchEvent) {
    el.dispatchEvent(e);
  } else {
    el.fireEvent('on' + type, e);
  }
  function makeClassicEvent () {
    var e;
    if (doc.createEvent) {
      e = doc.createEvent('Event');
      e.initEvent(type, true, true);
    } else if (doc.createEventObject) {
      e = doc.createEventObject();
    }
    return e;
  }
  function makeCustomEvent () {
    return new customEvent(type, { detail: model });
  }
}

function wrapperFactory (el, type, fn) {
  return function wrapper (originalEvent) {
    var e = originalEvent || global.event;
    e.target = e.target || e.srcElement;
    e.preventDefault = e.preventDefault || function preventDefault () { e.returnValue = false; };
    e.stopPropagation = e.stopPropagation || function stopPropagation () { e.cancelBubble = true; };
    e.which = e.which || e.keyCode;
    fn.call(el, e);
  };
}

function wrap (el, type, fn) {
  var wrapper = unwrap(el, type, fn) || wrapperFactory(el, type, fn);
  hardCache.push({
    wrapper: wrapper,
    element: el,
    type: type,
    fn: fn
  });
  return wrapper;
}

function unwrap (el, type, fn) {
  var i = find(el, type, fn);
  if (i) {
    var wrapper = hardCache[i].wrapper;
    hardCache.splice(i, 1); // free up a tad of memory
    return wrapper;
  }
}

function find (el, type, fn) {
  var i, item;
  for (i = 0; i < hardCache.length; i++) {
    item = hardCache[i];
    if (item.element === el && item.type === type && item.fn === fn) {
      return i;
    }
  }
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./eventmap":11,"custom-event":9}],11:[function(require,module,exports){
(function (global){
'use strict';

var eventmap = [];
var eventname = '';
var ron = /^on/;

for (eventname in global) {
  if (ron.test(eventname)) {
    eventmap.push(eventname.slice(2));
  }
}

module.exports = eventmap;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],12:[function(require,module,exports){
'use strict';

var atoa = require('atoa');
var events = [
    'cancel',
    'cloned',
    'drag',
    'dragend',
    'drop',
    'out',
    'over',
    'remove',
    'shadow',
    'drag-model',
    'drop-model',
    'remove-model'
];

function replicateEvents(angular, bag, scope) {
    events.forEach(replicator);

    function replicator(type) {
        bag.drake.on(type, replicate);

        function replicate() {
            var args = atoa(arguments).map(angularize);
            args.unshift(bag.name + '.' + type);
            scope.$emit.apply(scope, args);
        }
    }

    function angularize(value) {
        if (angular.isElement(value)) {
            return angular.element(value);
        }
        return value;
    }
}

module.exports = replicateEvents;

},{"atoa":3}],13:[function(require,module,exports){
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
                sourceData;

            drake.on('remove', function removeModel(el, source) {
                sourceModel = drake.models[drake.containers.indexOf(source)];
                sourceData = drake.data[drake.containers.indexOf(source)];
                scope.$applyAsync(function () {
                    var removedModels = sourceModel.splice(dragIndex, 1);
                    drake.emit('remove-model', removedModels[0], sourceModel, sourceData, dragIndex);
                });
            });

            drake.on('drag', function (el, source) {
                dragElm = el;
                dragIndex = domIndexOf(el, source);
                scope.$applyAsync(function () {
                    clearModels();
                    sourceModel = drake.models[drake.containers.indexOf(source)];
                    sourceData = drake.data[drake.containers.indexOf(source)];
                    draggedModel = sourceModel[dragIndex];
                    drake.emit('drag-model', draggedModel, sourceModel, sourceData, dragIndex);
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
                    sourceData = drake.data[drake.containers.indexOf(source)];
                    var targetModel,
                        targetData;
                    if (target === source) {
                        droppedModel = sourceModel.splice(dragIndex, 1)[0];
                        sourceModel.splice(dropIndex, 0, droppedModel);
                        targetModel = sourceModel;
                        targetData = sourceData;
                    } else {
                        var notCopy = dragElm === dropElm;
                        targetModel = drake.models[drake.containers.indexOf(target)];
                        targetData = drake.data[drake.containers.indexOf(target)];
                        var dropElmModel = notCopy ? draggedModel : angular.copy(draggedModel);
                        droppedModel = convertModelFunc(dropElmModel, sourceModel, sourceData, targetModel, targetData);
                        if (notCopy) {
                            sourceModel.splice(dragIndex, 1);
                        }
                        targetModel.splice(dropIndex, 0, droppedModel);
                        target.removeChild(dropElm); // element must be removed for ngRepeat to apply correctly
                    }
                    drake.emit('drop-model', droppedModel, sourceModel, sourceData, targetModel, targetData, dropIndex);
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
            convertModelFunc = convertFunc || passThroughFunc;
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

},{"./replicate-events":12,"dragula":5}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJhbmd1bGFyLWRyYWd1bGEuanMiLCJkaXJlY3RpdmUuanMiLCJub2RlX21vZHVsZXMvYXRvYS9hdG9hLmpzIiwibm9kZV9tb2R1bGVzL2RyYWd1bGEvY2xhc3Nlcy5qcyIsIm5vZGVfbW9kdWxlcy9kcmFndWxhL2RyYWd1bGEuanMiLCJub2RlX21vZHVsZXMvZHJhZ3VsYS9ub2RlX21vZHVsZXMvY29udHJhL2RlYm91bmNlLmpzIiwibm9kZV9tb2R1bGVzL2RyYWd1bGEvbm9kZV9tb2R1bGVzL2NvbnRyYS9lbWl0dGVyLmpzIiwibm9kZV9tb2R1bGVzL2RyYWd1bGEvbm9kZV9tb2R1bGVzL2NvbnRyYS9ub2RlX21vZHVsZXMvdGlja3kvdGlja3ktYnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy9kcmFndWxhL25vZGVfbW9kdWxlcy9jcm9zc3ZlbnQvbm9kZV9tb2R1bGVzL2N1c3RvbS1ldmVudC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kcmFndWxhL25vZGVfbW9kdWxlcy9jcm9zc3ZlbnQvc3JjL2Nyb3NzdmVudC5qcyIsIm5vZGVfbW9kdWxlcy9kcmFndWxhL25vZGVfbW9kdWxlcy9jcm9zc3ZlbnQvc3JjL2V2ZW50bWFwLmpzIiwicmVwbGljYXRlLWV2ZW50cy5qcyIsInNlcnZpY2UuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbERBO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ2pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUM5aEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FDckdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZHJhZ3VsYVNlcnZpY2UgPSByZXF1aXJlKCcuL3NlcnZpY2UnKTtcbnZhciBkcmFndWxhRGlyZWN0aXZlID0gcmVxdWlyZSgnLi9kaXJlY3RpdmUnKTtcblxuZnVuY3Rpb24gcmVnaXN0ZXIgKGFuZ3VsYXIpIHtcbiAgdmFyIGFwcCA9IGFuZ3VsYXIubW9kdWxlKCdkcmFndWxhJywgWyduZyddKTtcblxuICBhcHAuZmFjdG9yeSgnZHJhZ3VsYVNlcnZpY2UnLCBkcmFndWxhU2VydmljZShhbmd1bGFyKSk7XG4gIGFwcC5kaXJlY3RpdmUoJ2RyYWd1bGEnLCBkcmFndWxhRGlyZWN0aXZlKGFuZ3VsYXIpKTtcblxuICByZXR1cm4gJ2RyYWd1bGEnO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHJlZ2lzdGVyO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZHJhZ3VsYSA9IHJlcXVpcmUoJ2RyYWd1bGEnKTtcblxuLypqc2hpbnQgdW51c2VkOiBmYWxzZSovXG5mdW5jdGlvbiByZWdpc3Rlcihhbmd1bGFyKSB7XG4gICAgcmV0dXJuIFsnZHJhZ3VsYVNlcnZpY2UnLCBmdW5jdGlvbiBhbmd1bGFyRHJhZ3VsYShkcmFndWxhU2VydmljZSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcmVzdHJpY3Q6ICdBJyxcbiAgICAgICAgICAgIHNjb3BlOiB7XG4gICAgICAgICAgICAgICAgZHJhZ3VsYVNjb3BlOiAnPScsXG4gICAgICAgICAgICAgICAgZHJhZ3VsYU1vZGVsOiAnPScsXG4gICAgICAgICAgICAgICAgZHJhZ3VsYURhdGE6ICc9J1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGxpbms6IGxpbmtcbiAgICAgICAgfTtcblxuICAgICAgICBmdW5jdGlvbiBsaW5rKHNjb3BlLCBlbGVtLCBhdHRycykge1xuICAgICAgICAgICAgdmFyIGRyYWd1bGFTY29wZSA9IHNjb3BlLmRyYWd1bGFTY29wZSB8fCBzY29wZS4kcGFyZW50O1xuICAgICAgICAgICAgdmFyIGNvbnRhaW5lciA9IGVsZW1bMF07XG4gICAgICAgICAgICB2YXIgbmFtZSA9IHNjb3BlLiRldmFsKGF0dHJzLmRyYWd1bGEpO1xuICAgICAgICAgICAgdmFyIG1vZGVsID0gc2NvcGUuZHJhZ3VsYU1vZGVsO1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBzY29wZS5kcmFndWxhRGF0YTtcbiAgICAgICAgICAgIHZhciBiYWcgPSBkcmFndWxhU2VydmljZS5maW5kKGRyYWd1bGFTY29wZSwgbmFtZSk7XG4gICAgICAgICAgICBpZiAoYmFnKSB7XG4gICAgICAgICAgICAgICAgYmFnLmRyYWtlLmNvbnRhaW5lcnMucHVzaChjb250YWluZXIpO1xuICAgICAgICAgICAgICAgIGlmIChtb2RlbCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoYmFnLmRyYWtlLm1vZGVscykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYmFnLmRyYWtlLm1vZGVscy5wdXNoKG1vZGVsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhZy5kcmFrZS5kYXRhLnB1c2goZGF0YSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBiYWcuZHJha2UubW9kZWxzID0gW21vZGVsXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhZy5kcmFrZS5kYXRhID0gW2RhdGFdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBkcmFrZSA9IGRyYWd1bGEoe1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lcnM6IFtjb250YWluZXJdXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmIChtb2RlbCkge1xuICAgICAgICAgICAgICAgIGRyYWtlLm1vZGVscyA9IFttb2RlbF07XG4gICAgICAgICAgICAgICAgZHJha2UuZGF0YSA9IFtkYXRhXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRyYWd1bGFTZXJ2aWNlLmFkZChkcmFndWxhU2NvcGUsIG5hbWUsIGRyYWtlKTtcbiAgICAgICAgfVxuICAgIH1dO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHJlZ2lzdGVyO1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBhdG9hIChhLCBuKSB7IHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhLCBuKTsgfVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgY2FjaGUgPSB7fTtcbnZhciBzdGFydCA9ICcoPzpefFxcXFxzKSc7XG52YXIgZW5kID0gJyg/OlxcXFxzfCQpJztcblxuZnVuY3Rpb24gbG9va3VwQ2xhc3MgKGNsYXNzTmFtZSkge1xuICB2YXIgY2FjaGVkID0gY2FjaGVbY2xhc3NOYW1lXTtcbiAgaWYgKGNhY2hlZCkge1xuICAgIGNhY2hlZC5sYXN0SW5kZXggPSAwO1xuICB9IGVsc2Uge1xuICAgIGNhY2hlW2NsYXNzTmFtZV0gPSBjYWNoZWQgPSBuZXcgUmVnRXhwKHN0YXJ0ICsgY2xhc3NOYW1lICsgZW5kLCAnZycpO1xuICB9XG4gIHJldHVybiBjYWNoZWQ7XG59XG5cbmZ1bmN0aW9uIGFkZENsYXNzIChlbCwgY2xhc3NOYW1lKSB7XG4gIHZhciBjdXJyZW50ID0gZWwuY2xhc3NOYW1lO1xuICBpZiAoIWN1cnJlbnQubGVuZ3RoKSB7XG4gICAgZWwuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICB9IGVsc2UgaWYgKCFsb29rdXBDbGFzcyhjbGFzc05hbWUpLnRlc3QoY3VycmVudCkpIHtcbiAgICBlbC5jbGFzc05hbWUgKz0gJyAnICsgY2xhc3NOYW1lO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJtQ2xhc3MgKGVsLCBjbGFzc05hbWUpIHtcbiAgZWwuY2xhc3NOYW1lID0gZWwuY2xhc3NOYW1lLnJlcGxhY2UobG9va3VwQ2xhc3MoY2xhc3NOYW1lKSwgJyAnKS50cmltKCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhZGQ6IGFkZENsYXNzLFxuICBybTogcm1DbGFzc1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCdjb250cmEvZW1pdHRlcicpO1xudmFyIGNyb3NzdmVudCA9IHJlcXVpcmUoJ2Nyb3NzdmVudCcpO1xudmFyIGNsYXNzZXMgPSByZXF1aXJlKCcuL2NsYXNzZXMnKTtcblxuZnVuY3Rpb24gZHJhZ3VsYSAoaW5pdGlhbENvbnRhaW5lcnMsIG9wdGlvbnMpIHtcbiAgdmFyIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gIGlmIChsZW4gPT09IDEgJiYgQXJyYXkuaXNBcnJheShpbml0aWFsQ29udGFpbmVycykgPT09IGZhbHNlKSB7XG4gICAgb3B0aW9ucyA9IGluaXRpYWxDb250YWluZXJzO1xuICAgIGluaXRpYWxDb250YWluZXJzID0gW107XG4gIH1cbiAgdmFyIGJvZHkgPSBkb2N1bWVudC5ib2R5O1xuICB2YXIgZG9jdW1lbnRFbGVtZW50ID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xuICB2YXIgX21pcnJvcjsgLy8gbWlycm9yIGltYWdlXG4gIHZhciBfc291cmNlOyAvLyBzb3VyY2UgY29udGFpbmVyXG4gIHZhciBfaXRlbTsgLy8gaXRlbSBiZWluZyBkcmFnZ2VkXG4gIHZhciBfb2Zmc2V0WDsgLy8gcmVmZXJlbmNlIHhcbiAgdmFyIF9vZmZzZXRZOyAvLyByZWZlcmVuY2UgeVxuICB2YXIgX2luaXRpYWxTaWJsaW5nOyAvLyByZWZlcmVuY2Ugc2libGluZyB3aGVuIGdyYWJiZWRcbiAgdmFyIF9jdXJyZW50U2libGluZzsgLy8gcmVmZXJlbmNlIHNpYmxpbmcgbm93XG4gIHZhciBfY29weTsgLy8gaXRlbSB1c2VkIGZvciBjb3B5aW5nXG4gIHZhciBfcmVuZGVyVGltZXI7IC8vIHRpbWVyIGZvciBzZXRUaW1lb3V0IHJlbmRlck1pcnJvckltYWdlXG4gIHZhciBfbGFzdERyb3BUYXJnZXQgPSBudWxsOyAvLyBsYXN0IGNvbnRhaW5lciBpdGVtIHdhcyBvdmVyXG4gIHZhciBfZ3JhYmJlZDsgLy8gaG9sZHMgbW91c2Vkb3duIGNvbnRleHQgdW50aWwgZmlyc3QgbW91c2Vtb3ZlXG5cbiAgdmFyIG8gPSBvcHRpb25zIHx8IHt9O1xuICBpZiAoby5tb3ZlcyA9PT0gdm9pZCAwKSB7IG8ubW92ZXMgPSBhbHdheXM7IH1cbiAgaWYgKG8uYWNjZXB0cyA9PT0gdm9pZCAwKSB7IG8uYWNjZXB0cyA9IGFsd2F5czsgfVxuICBpZiAoby5pbnZhbGlkID09PSB2b2lkIDApIHsgby5pbnZhbGlkID0gaW52YWxpZFRhcmdldDsgfVxuICBpZiAoby5jb250YWluZXJzID09PSB2b2lkIDApIHsgby5jb250YWluZXJzID0gaW5pdGlhbENvbnRhaW5lcnMgfHwgW107IH1cbiAgaWYgKG8uaXNDb250YWluZXIgPT09IHZvaWQgMCkgeyBvLmlzQ29udGFpbmVyID0gbmV2ZXI7IH1cbiAgaWYgKG8uY29weSA9PT0gdm9pZCAwKSB7IG8uY29weSA9IGZhbHNlOyB9XG4gIGlmIChvLnJldmVydE9uU3BpbGwgPT09IHZvaWQgMCkgeyBvLnJldmVydE9uU3BpbGwgPSBmYWxzZTsgfVxuICBpZiAoby5yZW1vdmVPblNwaWxsID09PSB2b2lkIDApIHsgby5yZW1vdmVPblNwaWxsID0gZmFsc2U7IH1cbiAgaWYgKG8uZGlyZWN0aW9uID09PSB2b2lkIDApIHsgby5kaXJlY3Rpb24gPSAndmVydGljYWwnOyB9XG4gIGlmIChvLm1pcnJvckNvbnRhaW5lciA9PT0gdm9pZCAwKSB7IG8ubWlycm9yQ29udGFpbmVyID0gYm9keTsgfVxuXG4gIHZhciBkcmFrZSA9IGVtaXR0ZXIoe1xuICAgIGNvbnRhaW5lcnM6IG8uY29udGFpbmVycyxcbiAgICBzdGFydDogbWFudWFsU3RhcnQsXG4gICAgZW5kOiBlbmQsXG4gICAgY2FuY2VsOiBjYW5jZWwsXG4gICAgcmVtb3ZlOiByZW1vdmUsXG4gICAgZGVzdHJveTogZGVzdHJveSxcbiAgICBkcmFnZ2luZzogZmFsc2VcbiAgfSk7XG5cbiAgaWYgKG8ucmVtb3ZlT25TcGlsbCA9PT0gdHJ1ZSkge1xuICAgIGRyYWtlLm9uKCdvdmVyJywgc3BpbGxPdmVyKS5vbignb3V0Jywgc3BpbGxPdXQpO1xuICB9XG5cbiAgZXZlbnRzKCk7XG5cbiAgcmV0dXJuIGRyYWtlO1xuXG4gIGZ1bmN0aW9uIGlzQ29udGFpbmVyIChlbCkge1xuICAgIHJldHVybiBkcmFrZS5jb250YWluZXJzLmluZGV4T2YoZWwpICE9PSAtMSB8fCBvLmlzQ29udGFpbmVyKGVsKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGV2ZW50cyAocmVtb3ZlKSB7XG4gICAgdmFyIG9wID0gcmVtb3ZlID8gJ3JlbW92ZScgOiAnYWRkJztcbiAgICB0b3VjaHkoZG9jdW1lbnRFbGVtZW50LCBvcCwgJ21vdXNlZG93bicsIGdyYWIpO1xuICAgIHRvdWNoeShkb2N1bWVudEVsZW1lbnQsIG9wLCAnbW91c2V1cCcsIHJlbGVhc2UpO1xuICB9XG5cbiAgZnVuY3Rpb24gZXZlbnR1YWxNb3ZlbWVudHMgKHJlbW92ZSkge1xuICAgIHZhciBvcCA9IHJlbW92ZSA/ICdyZW1vdmUnIDogJ2FkZCc7XG4gICAgdG91Y2h5KGRvY3VtZW50RWxlbWVudCwgb3AsICdtb3VzZW1vdmUnLCBzdGFydEJlY2F1c2VNb3VzZU1vdmVkKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG1vdmVtZW50cyAocmVtb3ZlKSB7XG4gICAgdmFyIG9wID0gcmVtb3ZlID8gJ3JlbW92ZScgOiAnYWRkJztcbiAgICB0b3VjaHkoZG9jdW1lbnRFbGVtZW50LCBvcCwgJ3NlbGVjdHN0YXJ0JywgcHJldmVudEdyYWJiZWQpOyAvLyBJRThcbiAgICB0b3VjaHkoZG9jdW1lbnRFbGVtZW50LCBvcCwgJ2NsaWNrJywgcHJldmVudEdyYWJiZWQpO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSAoKSB7XG4gICAgZXZlbnRzKHRydWUpO1xuICAgIHJlbGVhc2Uoe30pO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJldmVudEdyYWJiZWQgKGUpIHtcbiAgICBpZiAoX2dyYWJiZWQpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBncmFiIChlKSB7XG4gICAgdmFyIGlnbm9yZSA9IChlLndoaWNoICE9PSAwICYmIGUud2hpY2ggIT09IDEpIHx8IGUubWV0YUtleSB8fCBlLmN0cmxLZXk7XG4gICAgaWYgKGlnbm9yZSkge1xuICAgICAgcmV0dXJuOyAvLyB3ZSBvbmx5IGNhcmUgYWJvdXQgaG9uZXN0LXRvLWdvZCBsZWZ0IGNsaWNrcyBhbmQgdG91Y2ggZXZlbnRzXG4gICAgfVxuICAgIHZhciBpdGVtID0gZS50YXJnZXQ7XG4gICAgdmFyIGNvbnRleHQgPSBjYW5TdGFydChpdGVtKTtcbiAgICBpZiAoIWNvbnRleHQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgX2dyYWJiZWQgPSBjb250ZXh0O1xuICAgIGV2ZW50dWFsTW92ZW1lbnRzKCk7XG4gICAgaWYgKGUudHlwZSA9PT0gJ21vdXNlZG93bicpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTsgLy8gZml4ZXMgaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL2RyYWd1bGEvaXNzdWVzLzE1NVxuICAgICAgaWYgKGl0ZW0udGFnTmFtZSA9PT0gJ0lOUFVUJyB8fCBpdGVtLnRhZ05hbWUgPT09ICdURVhUQVJFQScpIHtcbiAgICAgICAgaXRlbS5mb2N1cygpOyAvLyBmaXhlcyBodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvZHJhZ3VsYS9pc3N1ZXMvMTc2XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc3RhcnRCZWNhdXNlTW91c2VNb3ZlZCAoZSkge1xuICAgIHZhciBncmFiYmVkID0gX2dyYWJiZWQ7IC8vIGNhbGwgdG8gZW5kKCkgdW5zZXRzIF9ncmFiYmVkXG4gICAgZXZlbnR1YWxNb3ZlbWVudHModHJ1ZSk7XG4gICAgbW92ZW1lbnRzKCk7XG4gICAgZW5kKCk7XG4gICAgc3RhcnQoZ3JhYmJlZCk7XG5cbiAgICB2YXIgb2Zmc2V0ID0gZ2V0T2Zmc2V0KF9pdGVtKTtcbiAgICBfb2Zmc2V0WCA9IGdldENvb3JkKCdwYWdlWCcsIGUpIC0gb2Zmc2V0LmxlZnQ7XG4gICAgX29mZnNldFkgPSBnZXRDb29yZCgncGFnZVknLCBlKSAtIG9mZnNldC50b3A7XG5cbiAgICBjbGFzc2VzLmFkZChfY29weSB8fCBfaXRlbSwgJ2d1LXRyYW5zaXQnKTtcbiAgICByZW5kZXJNaXJyb3JJbWFnZSgpO1xuICAgIGRyYWcoZSk7XG4gIH1cblxuICBmdW5jdGlvbiBjYW5TdGFydCAoaXRlbSkge1xuICAgIGlmIChkcmFrZS5kcmFnZ2luZyAmJiBfbWlycm9yKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChpc0NvbnRhaW5lcihpdGVtKSkge1xuICAgICAgcmV0dXJuOyAvLyBkb24ndCBkcmFnIGNvbnRhaW5lciBpdHNlbGZcbiAgICB9XG4gICAgdmFyIGhhbmRsZSA9IGl0ZW07XG4gICAgd2hpbGUgKGl0ZW0ucGFyZW50RWxlbWVudCAmJiBpc0NvbnRhaW5lcihpdGVtLnBhcmVudEVsZW1lbnQpID09PSBmYWxzZSkge1xuICAgICAgaWYgKG8uaW52YWxpZChpdGVtLCBoYW5kbGUpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGl0ZW0gPSBpdGVtLnBhcmVudEVsZW1lbnQ7IC8vIGRyYWcgdGFyZ2V0IHNob3VsZCBiZSBhIHRvcCBlbGVtZW50XG4gICAgICBpZiAoIWl0ZW0pIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cbiAgICB2YXIgc291cmNlID0gaXRlbS5wYXJlbnRFbGVtZW50O1xuICAgIGlmICghc291cmNlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChvLmludmFsaWQoaXRlbSwgaGFuZGxlKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBtb3ZhYmxlID0gby5tb3ZlcyhpdGVtLCBzb3VyY2UsIGhhbmRsZSk7XG4gICAgaWYgKCFtb3ZhYmxlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGl0ZW06IGl0ZW0sXG4gICAgICBzb3VyY2U6IHNvdXJjZVxuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiBtYW51YWxTdGFydCAoaXRlbSkge1xuICAgIHZhciBjb250ZXh0ID0gY2FuU3RhcnQoaXRlbSk7XG4gICAgaWYgKGNvbnRleHQpIHtcbiAgICAgIHN0YXJ0KGNvbnRleHQpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHN0YXJ0IChjb250ZXh0KSB7XG4gICAgaWYgKGlzQ29weShjb250ZXh0Lml0ZW0sIGNvbnRleHQuc291cmNlKSkge1xuICAgICAgX2NvcHkgPSBjb250ZXh0Lml0ZW0uY2xvbmVOb2RlKHRydWUpO1xuICAgICAgZHJha2UuZW1pdCgnY2xvbmVkJywgX2NvcHksIGNvbnRleHQuaXRlbSwgJ2NvcHknKTtcbiAgICB9XG5cbiAgICBfc291cmNlID0gY29udGV4dC5zb3VyY2U7XG4gICAgX2l0ZW0gPSBjb250ZXh0Lml0ZW07XG4gICAgX2luaXRpYWxTaWJsaW5nID0gX2N1cnJlbnRTaWJsaW5nID0gbmV4dEVsKGNvbnRleHQuaXRlbSk7XG5cbiAgICBkcmFrZS5kcmFnZ2luZyA9IHRydWU7XG4gICAgZHJha2UuZW1pdCgnZHJhZycsIF9pdGVtLCBfc291cmNlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGludmFsaWRUYXJnZXQgKCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGVuZCAoKSB7XG4gICAgaWYgKCFkcmFrZS5kcmFnZ2luZykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgaXRlbSA9IF9jb3B5IHx8IF9pdGVtO1xuICAgIGRyb3AoaXRlbSwgaXRlbS5wYXJlbnRFbGVtZW50KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVuZ3JhYiAoKSB7XG4gICAgX2dyYWJiZWQgPSBmYWxzZTtcbiAgICBldmVudHVhbE1vdmVtZW50cyh0cnVlKTtcbiAgICBtb3ZlbWVudHModHJ1ZSk7XG4gIH1cblxuICBmdW5jdGlvbiByZWxlYXNlIChlKSB7XG4gICAgdW5ncmFiKCk7XG5cbiAgICBpZiAoIWRyYWtlLmRyYWdnaW5nKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciBpdGVtID0gX2NvcHkgfHwgX2l0ZW07XG4gICAgdmFyIGNsaWVudFggPSBnZXRDb29yZCgnY2xpZW50WCcsIGUpO1xuICAgIHZhciBjbGllbnRZID0gZ2V0Q29vcmQoJ2NsaWVudFknLCBlKTtcbiAgICB2YXIgZWxlbWVudEJlaGluZEN1cnNvciA9IGdldEVsZW1lbnRCZWhpbmRQb2ludChfbWlycm9yLCBjbGllbnRYLCBjbGllbnRZKTtcbiAgICB2YXIgZHJvcFRhcmdldCA9IGZpbmREcm9wVGFyZ2V0KGVsZW1lbnRCZWhpbmRDdXJzb3IsIGNsaWVudFgsIGNsaWVudFkpO1xuICAgIGlmIChkcm9wVGFyZ2V0ICYmICghX2NvcHkgfHwgZHJvcFRhcmdldCAhPT0gX3NvdXJjZSkpIHtcbiAgICAgIGRyb3AoaXRlbSwgZHJvcFRhcmdldCk7XG4gICAgfSBlbHNlIGlmIChvLnJlbW92ZU9uU3BpbGwpIHtcbiAgICAgIHJlbW92ZSgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjYW5jZWwoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkcm9wIChpdGVtLCB0YXJnZXQpIHtcbiAgICBpZiAoaXNJbml0aWFsUGxhY2VtZW50KHRhcmdldCkpIHtcbiAgICAgIGRyYWtlLmVtaXQoJ2NhbmNlbCcsIGl0ZW0sIF9zb3VyY2UpO1xuICAgIH0gZWxzZSB7XG4gICAgICBkcmFrZS5lbWl0KCdkcm9wJywgaXRlbSwgdGFyZ2V0LCBfc291cmNlKTtcbiAgICB9XG4gICAgY2xlYW51cCgpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVtb3ZlICgpIHtcbiAgICBpZiAoIWRyYWtlLmRyYWdnaW5nKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciBpdGVtID0gX2NvcHkgfHwgX2l0ZW07XG4gICAgdmFyIHBhcmVudCA9IGl0ZW0ucGFyZW50RWxlbWVudDtcbiAgICBpZiAocGFyZW50KSB7XG4gICAgICBwYXJlbnQucmVtb3ZlQ2hpbGQoaXRlbSk7XG4gICAgfVxuICAgIGRyYWtlLmVtaXQoX2NvcHkgPyAnY2FuY2VsJyA6ICdyZW1vdmUnLCBpdGVtLCBwYXJlbnQpO1xuICAgIGNsZWFudXAoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNhbmNlbCAocmV2ZXJ0KSB7XG4gICAgaWYgKCFkcmFrZS5kcmFnZ2luZykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgcmV2ZXJ0cyA9IGFyZ3VtZW50cy5sZW5ndGggPiAwID8gcmV2ZXJ0IDogby5yZXZlcnRPblNwaWxsO1xuICAgIHZhciBpdGVtID0gX2NvcHkgfHwgX2l0ZW07XG4gICAgdmFyIHBhcmVudCA9IGl0ZW0ucGFyZW50RWxlbWVudDtcbiAgICBpZiAocGFyZW50ID09PSBfc291cmNlICYmIF9jb3B5KSB7XG4gICAgICBwYXJlbnQucmVtb3ZlQ2hpbGQoX2NvcHkpO1xuICAgIH1cbiAgICB2YXIgaW5pdGlhbCA9IGlzSW5pdGlhbFBsYWNlbWVudChwYXJlbnQpO1xuICAgIGlmIChpbml0aWFsID09PSBmYWxzZSAmJiAhX2NvcHkgJiYgcmV2ZXJ0cykge1xuICAgICAgX3NvdXJjZS5pbnNlcnRCZWZvcmUoaXRlbSwgX2luaXRpYWxTaWJsaW5nKTtcbiAgICB9XG4gICAgaWYgKGluaXRpYWwgfHwgcmV2ZXJ0cykge1xuICAgICAgZHJha2UuZW1pdCgnY2FuY2VsJywgaXRlbSwgX3NvdXJjZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRyYWtlLmVtaXQoJ2Ryb3AnLCBpdGVtLCBwYXJlbnQsIF9zb3VyY2UpO1xuICAgIH1cbiAgICBjbGVhbnVwKCk7XG4gIH1cblxuICBmdW5jdGlvbiBjbGVhbnVwICgpIHtcbiAgICB2YXIgaXRlbSA9IF9jb3B5IHx8IF9pdGVtO1xuICAgIHVuZ3JhYigpO1xuICAgIHJlbW92ZU1pcnJvckltYWdlKCk7XG4gICAgaWYgKGl0ZW0pIHtcbiAgICAgIGNsYXNzZXMucm0oaXRlbSwgJ2d1LXRyYW5zaXQnKTtcbiAgICB9XG4gICAgaWYgKF9yZW5kZXJUaW1lcikge1xuICAgICAgY2xlYXJUaW1lb3V0KF9yZW5kZXJUaW1lcik7XG4gICAgfVxuICAgIGRyYWtlLmRyYWdnaW5nID0gZmFsc2U7XG4gICAgZHJha2UuZW1pdCgnb3V0JywgaXRlbSwgX2xhc3REcm9wVGFyZ2V0LCBfc291cmNlKTtcbiAgICBkcmFrZS5lbWl0KCdkcmFnZW5kJywgaXRlbSk7XG4gICAgX3NvdXJjZSA9IF9pdGVtID0gX2NvcHkgPSBfaW5pdGlhbFNpYmxpbmcgPSBfY3VycmVudFNpYmxpbmcgPSBfcmVuZGVyVGltZXIgPSBfbGFzdERyb3BUYXJnZXQgPSBudWxsO1xuICB9XG5cbiAgZnVuY3Rpb24gaXNJbml0aWFsUGxhY2VtZW50ICh0YXJnZXQsIHMpIHtcbiAgICB2YXIgc2libGluZztcbiAgICBpZiAocyAhPT0gdm9pZCAwKSB7XG4gICAgICBzaWJsaW5nID0gcztcbiAgICB9IGVsc2UgaWYgKF9taXJyb3IpIHtcbiAgICAgIHNpYmxpbmcgPSBfY3VycmVudFNpYmxpbmc7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNpYmxpbmcgPSBuZXh0RWwoX2NvcHkgfHwgX2l0ZW0pO1xuICAgIH1cbiAgICByZXR1cm4gdGFyZ2V0ID09PSBfc291cmNlICYmIHNpYmxpbmcgPT09IF9pbml0aWFsU2libGluZztcbiAgfVxuXG4gIGZ1bmN0aW9uIGZpbmREcm9wVGFyZ2V0IChlbGVtZW50QmVoaW5kQ3Vyc29yLCBjbGllbnRYLCBjbGllbnRZKSB7XG4gICAgdmFyIHRhcmdldCA9IGVsZW1lbnRCZWhpbmRDdXJzb3I7XG4gICAgd2hpbGUgKHRhcmdldCAmJiAhYWNjZXB0ZWQoKSkge1xuICAgICAgdGFyZ2V0ID0gdGFyZ2V0LnBhcmVudEVsZW1lbnQ7XG4gICAgfVxuICAgIHJldHVybiB0YXJnZXQ7XG5cbiAgICBmdW5jdGlvbiBhY2NlcHRlZCAoKSB7XG4gICAgICB2YXIgZHJvcHBhYmxlID0gaXNDb250YWluZXIodGFyZ2V0KTtcbiAgICAgIGlmIChkcm9wcGFibGUgPT09IGZhbHNlKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgdmFyIGltbWVkaWF0ZSA9IGdldEltbWVkaWF0ZUNoaWxkKHRhcmdldCwgZWxlbWVudEJlaGluZEN1cnNvcik7XG4gICAgICB2YXIgcmVmZXJlbmNlID0gZ2V0UmVmZXJlbmNlKHRhcmdldCwgaW1tZWRpYXRlLCBjbGllbnRYLCBjbGllbnRZKTtcbiAgICAgIHZhciBpbml0aWFsID0gaXNJbml0aWFsUGxhY2VtZW50KHRhcmdldCwgcmVmZXJlbmNlKTtcbiAgICAgIGlmIChpbml0aWFsKSB7XG4gICAgICAgIHJldHVybiB0cnVlOyAvLyBzaG91bGQgYWx3YXlzIGJlIGFibGUgdG8gZHJvcCBpdCByaWdodCBiYWNrIHdoZXJlIGl0IHdhc1xuICAgICAgfVxuICAgICAgcmV0dXJuIG8uYWNjZXB0cyhfaXRlbSwgdGFyZ2V0LCBfc291cmNlLCByZWZlcmVuY2UpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRyYWcgKGUpIHtcbiAgICBpZiAoIV9taXJyb3IpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gICAgdmFyIGNsaWVudFggPSBnZXRDb29yZCgnY2xpZW50WCcsIGUpO1xuICAgIHZhciBjbGllbnRZID0gZ2V0Q29vcmQoJ2NsaWVudFknLCBlKTtcbiAgICB2YXIgeCA9IGNsaWVudFggLSBfb2Zmc2V0WDtcbiAgICB2YXIgeSA9IGNsaWVudFkgLSBfb2Zmc2V0WTtcblxuICAgIF9taXJyb3Iuc3R5bGUubGVmdCA9IHggKyAncHgnO1xuICAgIF9taXJyb3Iuc3R5bGUudG9wICA9IHkgKyAncHgnO1xuXG4gICAgdmFyIGl0ZW0gPSBfY29weSB8fCBfaXRlbTtcbiAgICB2YXIgZWxlbWVudEJlaGluZEN1cnNvciA9IGdldEVsZW1lbnRCZWhpbmRQb2ludChfbWlycm9yLCBjbGllbnRYLCBjbGllbnRZKTtcbiAgICB2YXIgZHJvcFRhcmdldCA9IGZpbmREcm9wVGFyZ2V0KGVsZW1lbnRCZWhpbmRDdXJzb3IsIGNsaWVudFgsIGNsaWVudFkpO1xuICAgIHZhciBjaGFuZ2VkID0gZHJvcFRhcmdldCAhPT0gbnVsbCAmJiBkcm9wVGFyZ2V0ICE9PSBfbGFzdERyb3BUYXJnZXQ7XG4gICAgaWYgKGNoYW5nZWQgfHwgZHJvcFRhcmdldCA9PT0gbnVsbCkge1xuICAgICAgb3V0KCk7XG4gICAgICBfbGFzdERyb3BUYXJnZXQgPSBkcm9wVGFyZ2V0O1xuICAgICAgb3ZlcigpO1xuICAgIH1cbiAgICBpZiAoZHJvcFRhcmdldCA9PT0gX3NvdXJjZSAmJiBfY29weSkge1xuICAgICAgaWYgKGl0ZW0ucGFyZW50RWxlbWVudCkge1xuICAgICAgICBpdGVtLnBhcmVudEVsZW1lbnQucmVtb3ZlQ2hpbGQoaXRlbSk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciByZWZlcmVuY2U7XG4gICAgdmFyIGltbWVkaWF0ZSA9IGdldEltbWVkaWF0ZUNoaWxkKGRyb3BUYXJnZXQsIGVsZW1lbnRCZWhpbmRDdXJzb3IpO1xuICAgIGlmIChpbW1lZGlhdGUgIT09IG51bGwpIHtcbiAgICAgIHJlZmVyZW5jZSA9IGdldFJlZmVyZW5jZShkcm9wVGFyZ2V0LCBpbW1lZGlhdGUsIGNsaWVudFgsIGNsaWVudFkpO1xuICAgIH0gZWxzZSBpZiAoby5yZXZlcnRPblNwaWxsID09PSB0cnVlICYmICFfY29weSkge1xuICAgICAgcmVmZXJlbmNlID0gX2luaXRpYWxTaWJsaW5nO1xuICAgICAgZHJvcFRhcmdldCA9IF9zb3VyY2U7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChfY29weSAmJiBpdGVtLnBhcmVudEVsZW1lbnQpIHtcbiAgICAgICAgaXRlbS5wYXJlbnRFbGVtZW50LnJlbW92ZUNoaWxkKGl0ZW0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoXG4gICAgICByZWZlcmVuY2UgPT09IG51bGwgfHxcbiAgICAgIHJlZmVyZW5jZSAhPT0gaXRlbSAmJlxuICAgICAgcmVmZXJlbmNlICE9PSBuZXh0RWwoaXRlbSkgJiZcbiAgICAgIHJlZmVyZW5jZSAhPT0gX2N1cnJlbnRTaWJsaW5nXG4gICAgKSB7XG4gICAgICBfY3VycmVudFNpYmxpbmcgPSByZWZlcmVuY2U7XG4gICAgICBkcm9wVGFyZ2V0Lmluc2VydEJlZm9yZShpdGVtLCByZWZlcmVuY2UpO1xuICAgICAgZHJha2UuZW1pdCgnc2hhZG93JywgaXRlbSwgZHJvcFRhcmdldCk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIG1vdmVkICh0eXBlKSB7IGRyYWtlLmVtaXQodHlwZSwgaXRlbSwgX2xhc3REcm9wVGFyZ2V0LCBfc291cmNlKTsgfVxuICAgIGZ1bmN0aW9uIG92ZXIgKCkgeyBpZiAoY2hhbmdlZCkgeyBtb3ZlZCgnb3ZlcicpOyB9IH1cbiAgICBmdW5jdGlvbiBvdXQgKCkgeyBpZiAoX2xhc3REcm9wVGFyZ2V0KSB7IG1vdmVkKCdvdXQnKTsgfSB9XG4gIH1cblxuICBmdW5jdGlvbiBzcGlsbE92ZXIgKGVsKSB7XG4gICAgY2xhc3Nlcy5ybShlbCwgJ2d1LWhpZGUnKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNwaWxsT3V0IChlbCkge1xuICAgIGlmIChkcmFrZS5kcmFnZ2luZykgeyBjbGFzc2VzLmFkZChlbCwgJ2d1LWhpZGUnKTsgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVuZGVyTWlycm9ySW1hZ2UgKCkge1xuICAgIGlmIChfbWlycm9yKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciByZWN0ID0gX2l0ZW0uZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgX21pcnJvciA9IF9pdGVtLmNsb25lTm9kZSh0cnVlKTtcbiAgICBfbWlycm9yLnN0eWxlLndpZHRoID0gZ2V0UmVjdFdpZHRoKHJlY3QpICsgJ3B4JztcbiAgICBfbWlycm9yLnN0eWxlLmhlaWdodCA9IGdldFJlY3RIZWlnaHQocmVjdCkgKyAncHgnO1xuICAgIGNsYXNzZXMucm0oX21pcnJvciwgJ2d1LXRyYW5zaXQnKTtcbiAgICBjbGFzc2VzLmFkZChfbWlycm9yLCAnZ3UtbWlycm9yJyk7XG4gICAgby5taXJyb3JDb250YWluZXIuYXBwZW5kQ2hpbGQoX21pcnJvcik7XG4gICAgdG91Y2h5KGRvY3VtZW50RWxlbWVudCwgJ2FkZCcsICdtb3VzZW1vdmUnLCBkcmFnKTtcbiAgICBjbGFzc2VzLmFkZChvLm1pcnJvckNvbnRhaW5lciwgJ2d1LXVuc2VsZWN0YWJsZScpO1xuICAgIGRyYWtlLmVtaXQoJ2Nsb25lZCcsIF9taXJyb3IsIF9pdGVtLCAnbWlycm9yJyk7XG4gIH1cblxuICBmdW5jdGlvbiByZW1vdmVNaXJyb3JJbWFnZSAoKSB7XG4gICAgaWYgKF9taXJyb3IpIHtcbiAgICAgIGNsYXNzZXMucm0oby5taXJyb3JDb250YWluZXIsICdndS11bnNlbGVjdGFibGUnKTtcbiAgICAgIHRvdWNoeShkb2N1bWVudEVsZW1lbnQsICdyZW1vdmUnLCAnbW91c2Vtb3ZlJywgZHJhZyk7XG4gICAgICBfbWlycm9yLnBhcmVudEVsZW1lbnQucmVtb3ZlQ2hpbGQoX21pcnJvcik7XG4gICAgICBfbWlycm9yID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBnZXRJbW1lZGlhdGVDaGlsZCAoZHJvcFRhcmdldCwgdGFyZ2V0KSB7XG4gICAgdmFyIGltbWVkaWF0ZSA9IHRhcmdldDtcbiAgICB3aGlsZSAoaW1tZWRpYXRlICE9PSBkcm9wVGFyZ2V0ICYmIGltbWVkaWF0ZS5wYXJlbnRFbGVtZW50ICE9PSBkcm9wVGFyZ2V0KSB7XG4gICAgICBpbW1lZGlhdGUgPSBpbW1lZGlhdGUucGFyZW50RWxlbWVudDtcbiAgICB9XG4gICAgaWYgKGltbWVkaWF0ZSA9PT0gZG9jdW1lbnRFbGVtZW50KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIGltbWVkaWF0ZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFJlZmVyZW5jZSAoZHJvcFRhcmdldCwgdGFyZ2V0LCB4LCB5KSB7XG4gICAgdmFyIGhvcml6b250YWwgPSBvLmRpcmVjdGlvbiA9PT0gJ2hvcml6b250YWwnO1xuICAgIHZhciByZWZlcmVuY2UgPSB0YXJnZXQgIT09IGRyb3BUYXJnZXQgPyBpbnNpZGUoKSA6IG91dHNpZGUoKTtcbiAgICByZXR1cm4gcmVmZXJlbmNlO1xuXG4gICAgZnVuY3Rpb24gb3V0c2lkZSAoKSB7IC8vIHNsb3dlciwgYnV0IGFibGUgdG8gZmlndXJlIG91dCBhbnkgcG9zaXRpb25cbiAgICAgIHZhciBsZW4gPSBkcm9wVGFyZ2V0LmNoaWxkcmVuLmxlbmd0aDtcbiAgICAgIHZhciBpO1xuICAgICAgdmFyIGVsO1xuICAgICAgdmFyIHJlY3Q7XG4gICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgZWwgPSBkcm9wVGFyZ2V0LmNoaWxkcmVuW2ldO1xuICAgICAgICByZWN0ID0gZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgIGlmIChob3Jpem9udGFsICYmIHJlY3QubGVmdCA+IHgpIHsgcmV0dXJuIGVsOyB9XG4gICAgICAgIGlmICghaG9yaXpvbnRhbCAmJiByZWN0LnRvcCA+IHkpIHsgcmV0dXJuIGVsOyB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpbnNpZGUgKCkgeyAvLyBmYXN0ZXIsIGJ1dCBvbmx5IGF2YWlsYWJsZSBpZiBkcm9wcGVkIGluc2lkZSBhIGNoaWxkIGVsZW1lbnRcbiAgICAgIHZhciByZWN0ID0gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgaWYgKGhvcml6b250YWwpIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUoeCA+IHJlY3QubGVmdCArIGdldFJlY3RXaWR0aChyZWN0KSAvIDIpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc29sdmUoeSA+IHJlY3QudG9wICsgZ2V0UmVjdEhlaWdodChyZWN0KSAvIDIpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlc29sdmUgKGFmdGVyKSB7XG4gICAgICByZXR1cm4gYWZ0ZXIgPyBuZXh0RWwodGFyZ2V0KSA6IHRhcmdldDtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBpc0NvcHkgKGl0ZW0sIGNvbnRhaW5lcikge1xuICAgIHJldHVybiB0eXBlb2Ygby5jb3B5ID09PSAnYm9vbGVhbicgPyBvLmNvcHkgOiBvLmNvcHkoaXRlbSwgY29udGFpbmVyKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB0b3VjaHkgKGVsLCBvcCwgdHlwZSwgZm4pIHtcbiAgdmFyIHRvdWNoID0ge1xuICAgIG1vdXNldXA6ICd0b3VjaGVuZCcsXG4gICAgbW91c2Vkb3duOiAndG91Y2hzdGFydCcsXG4gICAgbW91c2Vtb3ZlOiAndG91Y2htb3ZlJ1xuICB9O1xuICB2YXIgbWljcm9zb2Z0ID0ge1xuICAgIG1vdXNldXA6ICdNU1BvaW50ZXJVcCcsXG4gICAgbW91c2Vkb3duOiAnTVNQb2ludGVyRG93bicsXG4gICAgbW91c2Vtb3ZlOiAnTVNQb2ludGVyTW92ZSdcbiAgfTtcbiAgaWYgKGdsb2JhbC5uYXZpZ2F0b3IubXNQb2ludGVyRW5hYmxlZCkge1xuICAgIGNyb3NzdmVudFtvcF0oZWwsIG1pY3Jvc29mdFt0eXBlXSwgZm4pO1xuICB9XG4gIGNyb3NzdmVudFtvcF0oZWwsIHRvdWNoW3R5cGVdLCBmbik7XG4gIGNyb3NzdmVudFtvcF0oZWwsIHR5cGUsIGZuKTtcbn1cblxuZnVuY3Rpb24gZ2V0T2Zmc2V0IChlbCkge1xuICB2YXIgcmVjdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICByZXR1cm4ge1xuICAgIGxlZnQ6IHJlY3QubGVmdCArIGdldFNjcm9sbCgnc2Nyb2xsTGVmdCcsICdwYWdlWE9mZnNldCcpLFxuICAgIHRvcDogcmVjdC50b3AgKyBnZXRTY3JvbGwoJ3Njcm9sbFRvcCcsICdwYWdlWU9mZnNldCcpXG4gIH07XG59XG5cbmZ1bmN0aW9uIGdldFNjcm9sbCAoc2Nyb2xsUHJvcCwgb2Zmc2V0UHJvcCkge1xuICBpZiAodHlwZW9mIGdsb2JhbFtvZmZzZXRQcm9wXSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICByZXR1cm4gZ2xvYmFsW29mZnNldFByb3BdO1xuICB9XG4gIHZhciBkb2N1bWVudEVsZW1lbnQgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG4gIGlmIChkb2N1bWVudEVsZW1lbnQuY2xpZW50SGVpZ2h0KSB7XG4gICAgcmV0dXJuIGRvY3VtZW50RWxlbWVudFtzY3JvbGxQcm9wXTtcbiAgfVxuICB2YXIgYm9keSA9IGRvY3VtZW50LmJvZHk7XG4gIHJldHVybiBib2R5W3Njcm9sbFByb3BdO1xufVxuXG5mdW5jdGlvbiBnZXRFbGVtZW50QmVoaW5kUG9pbnQgKHBvaW50LCB4LCB5KSB7XG4gIHZhciBwID0gcG9pbnQgfHwge307XG4gIHZhciBzdGF0ZSA9IHAuY2xhc3NOYW1lO1xuICB2YXIgZWw7XG4gIHAuY2xhc3NOYW1lICs9ICcgZ3UtaGlkZSc7XG4gIGVsID0gZG9jdW1lbnQuZWxlbWVudEZyb21Qb2ludCh4LCB5KTtcbiAgcC5jbGFzc05hbWUgPSBzdGF0ZTtcbiAgcmV0dXJuIGVsO1xufVxuXG5mdW5jdGlvbiBuZXZlciAoKSB7IHJldHVybiBmYWxzZTsgfVxuZnVuY3Rpb24gYWx3YXlzICgpIHsgcmV0dXJuIHRydWU7IH1cbmZ1bmN0aW9uIGdldFJlY3RXaWR0aCAocmVjdCkgeyByZXR1cm4gcmVjdC53aWR0aCB8fCAocmVjdC5yaWdodCAtIHJlY3QubGVmdCk7IH1cbmZ1bmN0aW9uIGdldFJlY3RIZWlnaHQgKHJlY3QpIHsgcmV0dXJuIHJlY3QuaGVpZ2h0IHx8IChyZWN0LmJvdHRvbSAtIHJlY3QudG9wKTsgfVxuXG5mdW5jdGlvbiBuZXh0RWwgKGVsKSB7XG4gIHJldHVybiBlbC5uZXh0RWxlbWVudFNpYmxpbmcgfHwgbWFudWFsbHkoKTtcbiAgZnVuY3Rpb24gbWFudWFsbHkgKCkge1xuICAgIHZhciBzaWJsaW5nID0gZWw7XG4gICAgZG8ge1xuICAgICAgc2libGluZyA9IHNpYmxpbmcubmV4dFNpYmxpbmc7XG4gICAgfSB3aGlsZSAoc2libGluZyAmJiBzaWJsaW5nLm5vZGVUeXBlICE9PSAxKTtcbiAgICByZXR1cm4gc2libGluZztcbiAgfVxufVxuXG5mdW5jdGlvbiBnZXRFdmVudEhvc3QgKGUpIHtcbiAgLy8gb24gdG91Y2hlbmQgZXZlbnQsIHdlIGhhdmUgdG8gdXNlIGBlLmNoYW5nZWRUb3VjaGVzYFxuICAvLyBzZWUgaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy83MTkyNTYzL3RvdWNoZW5kLWV2ZW50LXByb3BlcnRpZXNcbiAgLy8gc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9kcmFndWxhL2lzc3Vlcy8zNFxuICBpZiAoZS50YXJnZXRUb3VjaGVzICYmIGUudGFyZ2V0VG91Y2hlcy5sZW5ndGgpIHtcbiAgICByZXR1cm4gZS50YXJnZXRUb3VjaGVzWzBdO1xuICB9XG4gIGlmIChlLmNoYW5nZWRUb3VjaGVzICYmIGUuY2hhbmdlZFRvdWNoZXMubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGUuY2hhbmdlZFRvdWNoZXNbMF07XG4gIH1cbiAgcmV0dXJuIGU7XG59XG5cbmZ1bmN0aW9uIGdldENvb3JkIChjb29yZCwgZSkge1xuICB2YXIgaG9zdCA9IGdldEV2ZW50SG9zdChlKTtcbiAgdmFyIG1pc3NNYXAgPSB7XG4gICAgcGFnZVg6ICdjbGllbnRYJywgLy8gSUU4XG4gICAgcGFnZVk6ICdjbGllbnRZJyAvLyBJRThcbiAgfTtcbiAgaWYgKGNvb3JkIGluIG1pc3NNYXAgJiYgIShjb29yZCBpbiBob3N0KSAmJiBtaXNzTWFwW2Nvb3JkXSBpbiBob3N0KSB7XG4gICAgY29vcmQgPSBtaXNzTWFwW2Nvb3JkXTtcbiAgfVxuICByZXR1cm4gaG9zdFtjb29yZF07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZHJhZ3VsYTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHRpY2t5ID0gcmVxdWlyZSgndGlja3knKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBkZWJvdW5jZSAoZm4sIGFyZ3MsIGN0eCkge1xuICBpZiAoIWZuKSB7IHJldHVybjsgfVxuICB0aWNreShmdW5jdGlvbiBydW4gKCkge1xuICAgIGZuLmFwcGx5KGN0eCB8fCBudWxsLCBhcmdzIHx8IFtdKTtcbiAgfSk7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYXRvYSA9IHJlcXVpcmUoJ2F0b2EnKTtcbnZhciBkZWJvdW5jZSA9IHJlcXVpcmUoJy4vZGVib3VuY2UnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBlbWl0dGVyICh0aGluZywgb3B0aW9ucykge1xuICB2YXIgb3B0cyA9IG9wdGlvbnMgfHwge307XG4gIHZhciBldnQgPSB7fTtcbiAgaWYgKHRoaW5nID09PSB1bmRlZmluZWQpIHsgdGhpbmcgPSB7fTsgfVxuICB0aGluZy5vbiA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgIGlmICghZXZ0W3R5cGVdKSB7XG4gICAgICBldnRbdHlwZV0gPSBbZm5dO1xuICAgIH0gZWxzZSB7XG4gICAgICBldnRbdHlwZV0ucHVzaChmbik7XG4gICAgfVxuICAgIHJldHVybiB0aGluZztcbiAgfTtcbiAgdGhpbmcub25jZSA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgIGZuLl9vbmNlID0gdHJ1ZTsgLy8gdGhpbmcub2ZmKGZuKSBzdGlsbCB3b3JrcyFcbiAgICB0aGluZy5vbih0eXBlLCBmbik7XG4gICAgcmV0dXJuIHRoaW5nO1xuICB9O1xuICB0aGluZy5vZmYgPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICB2YXIgYyA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgaWYgKGMgPT09IDEpIHtcbiAgICAgIGRlbGV0ZSBldnRbdHlwZV07XG4gICAgfSBlbHNlIGlmIChjID09PSAwKSB7XG4gICAgICBldnQgPSB7fTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGV0ID0gZXZ0W3R5cGVdO1xuICAgICAgaWYgKCFldCkgeyByZXR1cm4gdGhpbmc7IH1cbiAgICAgIGV0LnNwbGljZShldC5pbmRleE9mKGZuKSwgMSk7XG4gICAgfVxuICAgIHJldHVybiB0aGluZztcbiAgfTtcbiAgdGhpbmcuZW1pdCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgYXJncyA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICByZXR1cm4gdGhpbmcuZW1pdHRlclNuYXBzaG90KGFyZ3Muc2hpZnQoKSkuYXBwbHkodGhpcywgYXJncyk7XG4gIH07XG4gIHRoaW5nLmVtaXR0ZXJTbmFwc2hvdCA9IGZ1bmN0aW9uICh0eXBlKSB7XG4gICAgdmFyIGV0ID0gKGV2dFt0eXBlXSB8fCBbXSkuc2xpY2UoMCk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBhcmdzID0gYXRvYShhcmd1bWVudHMpO1xuICAgICAgdmFyIGN0eCA9IHRoaXMgfHwgdGhpbmc7XG4gICAgICBpZiAodHlwZSA9PT0gJ2Vycm9yJyAmJiBvcHRzLnRocm93cyAhPT0gZmFsc2UgJiYgIWV0Lmxlbmd0aCkgeyB0aHJvdyBhcmdzLmxlbmd0aCA9PT0gMSA/IGFyZ3NbMF0gOiBhcmdzOyB9XG4gICAgICBldC5mb3JFYWNoKGZ1bmN0aW9uIGVtaXR0ZXIgKGxpc3Rlbikge1xuICAgICAgICBpZiAob3B0cy5hc3luYykgeyBkZWJvdW5jZShsaXN0ZW4sIGFyZ3MsIGN0eCk7IH0gZWxzZSB7IGxpc3Rlbi5hcHBseShjdHgsIGFyZ3MpOyB9XG4gICAgICAgIGlmIChsaXN0ZW4uX29uY2UpIHsgdGhpbmcub2ZmKHR5cGUsIGxpc3Rlbik7IH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHRoaW5nO1xuICAgIH07XG4gIH07XG4gIHJldHVybiB0aGluZztcbn07XG4iLCJ2YXIgc2kgPSB0eXBlb2Ygc2V0SW1tZWRpYXRlID09PSAnZnVuY3Rpb24nLCB0aWNrO1xuaWYgKHNpKSB7XG4gIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0SW1tZWRpYXRlKGZuKTsgfTtcbn0gZWxzZSB7XG4gIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0VGltZW91dChmbiwgMCk7IH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gdGljazsiLCJcbnZhciBOYXRpdmVDdXN0b21FdmVudCA9IGdsb2JhbC5DdXN0b21FdmVudDtcblxuZnVuY3Rpb24gdXNlTmF0aXZlICgpIHtcbiAgdHJ5IHtcbiAgICB2YXIgcCA9IG5ldyBOYXRpdmVDdXN0b21FdmVudCgnY2F0JywgeyBkZXRhaWw6IHsgZm9vOiAnYmFyJyB9IH0pO1xuICAgIHJldHVybiAgJ2NhdCcgPT09IHAudHlwZSAmJiAnYmFyJyA9PT0gcC5kZXRhaWwuZm9vO1xuICB9IGNhdGNoIChlKSB7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIENyb3NzLWJyb3dzZXIgYEN1c3RvbUV2ZW50YCBjb25zdHJ1Y3Rvci5cbiAqXG4gKiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvQ3VzdG9tRXZlbnQuQ3VzdG9tRXZlbnRcbiAqXG4gKiBAcHVibGljXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSB1c2VOYXRpdmUoKSA/IE5hdGl2ZUN1c3RvbUV2ZW50IDpcblxuLy8gSUUgPj0gOVxuJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGRvY3VtZW50LmNyZWF0ZUV2ZW50ID8gZnVuY3Rpb24gQ3VzdG9tRXZlbnQgKHR5cGUsIHBhcmFtcykge1xuICB2YXIgZSA9IGRvY3VtZW50LmNyZWF0ZUV2ZW50KCdDdXN0b21FdmVudCcpO1xuICBpZiAocGFyYW1zKSB7XG4gICAgZS5pbml0Q3VzdG9tRXZlbnQodHlwZSwgcGFyYW1zLmJ1YmJsZXMsIHBhcmFtcy5jYW5jZWxhYmxlLCBwYXJhbXMuZGV0YWlsKTtcbiAgfSBlbHNlIHtcbiAgICBlLmluaXRDdXN0b21FdmVudCh0eXBlLCBmYWxzZSwgZmFsc2UsIHZvaWQgMCk7XG4gIH1cbiAgcmV0dXJuIGU7XG59IDpcblxuLy8gSUUgPD0gOFxuZnVuY3Rpb24gQ3VzdG9tRXZlbnQgKHR5cGUsIHBhcmFtcykge1xuICB2YXIgZSA9IGRvY3VtZW50LmNyZWF0ZUV2ZW50T2JqZWN0KCk7XG4gIGUudHlwZSA9IHR5cGU7XG4gIGlmIChwYXJhbXMpIHtcbiAgICBlLmJ1YmJsZXMgPSBCb29sZWFuKHBhcmFtcy5idWJibGVzKTtcbiAgICBlLmNhbmNlbGFibGUgPSBCb29sZWFuKHBhcmFtcy5jYW5jZWxhYmxlKTtcbiAgICBlLmRldGFpbCA9IHBhcmFtcy5kZXRhaWw7XG4gIH0gZWxzZSB7XG4gICAgZS5idWJibGVzID0gZmFsc2U7XG4gICAgZS5jYW5jZWxhYmxlID0gZmFsc2U7XG4gICAgZS5kZXRhaWwgPSB2b2lkIDA7XG4gIH1cbiAgcmV0dXJuIGU7XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBjdXN0b21FdmVudCA9IHJlcXVpcmUoJ2N1c3RvbS1ldmVudCcpO1xudmFyIGV2ZW50bWFwID0gcmVxdWlyZSgnLi9ldmVudG1hcCcpO1xudmFyIGRvYyA9IGdsb2JhbC5kb2N1bWVudDtcbnZhciBhZGRFdmVudCA9IGFkZEV2ZW50RWFzeTtcbnZhciByZW1vdmVFdmVudCA9IHJlbW92ZUV2ZW50RWFzeTtcbnZhciBoYXJkQ2FjaGUgPSBbXTtcblxuaWYgKCFnbG9iYWwuYWRkRXZlbnRMaXN0ZW5lcikge1xuICBhZGRFdmVudCA9IGFkZEV2ZW50SGFyZDtcbiAgcmVtb3ZlRXZlbnQgPSByZW1vdmVFdmVudEhhcmQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhZGQ6IGFkZEV2ZW50LFxuICByZW1vdmU6IHJlbW92ZUV2ZW50LFxuICBmYWJyaWNhdGU6IGZhYnJpY2F0ZUV2ZW50XG59O1xuXG5mdW5jdGlvbiBhZGRFdmVudEVhc3kgKGVsLCB0eXBlLCBmbiwgY2FwdHVyaW5nKSB7XG4gIHJldHVybiBlbC5hZGRFdmVudExpc3RlbmVyKHR5cGUsIGZuLCBjYXB0dXJpbmcpO1xufVxuXG5mdW5jdGlvbiBhZGRFdmVudEhhcmQgKGVsLCB0eXBlLCBmbikge1xuICByZXR1cm4gZWwuYXR0YWNoRXZlbnQoJ29uJyArIHR5cGUsIHdyYXAoZWwsIHR5cGUsIGZuKSk7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZUV2ZW50RWFzeSAoZWwsIHR5cGUsIGZuLCBjYXB0dXJpbmcpIHtcbiAgcmV0dXJuIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIodHlwZSwgZm4sIGNhcHR1cmluZyk7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZUV2ZW50SGFyZCAoZWwsIHR5cGUsIGZuKSB7XG4gIHZhciBsaXN0ZW5lciA9IHVud3JhcChlbCwgdHlwZSwgZm4pO1xuICBpZiAobGlzdGVuZXIpIHtcbiAgICByZXR1cm4gZWwuZGV0YWNoRXZlbnQoJ29uJyArIHR5cGUsIGxpc3RlbmVyKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBmYWJyaWNhdGVFdmVudCAoZWwsIHR5cGUsIG1vZGVsKSB7XG4gIHZhciBlID0gZXZlbnRtYXAuaW5kZXhPZih0eXBlKSA9PT0gLTEgPyBtYWtlQ3VzdG9tRXZlbnQoKSA6IG1ha2VDbGFzc2ljRXZlbnQoKTtcbiAgaWYgKGVsLmRpc3BhdGNoRXZlbnQpIHtcbiAgICBlbC5kaXNwYXRjaEV2ZW50KGUpO1xuICB9IGVsc2Uge1xuICAgIGVsLmZpcmVFdmVudCgnb24nICsgdHlwZSwgZSk7XG4gIH1cbiAgZnVuY3Rpb24gbWFrZUNsYXNzaWNFdmVudCAoKSB7XG4gICAgdmFyIGU7XG4gICAgaWYgKGRvYy5jcmVhdGVFdmVudCkge1xuICAgICAgZSA9IGRvYy5jcmVhdGVFdmVudCgnRXZlbnQnKTtcbiAgICAgIGUuaW5pdEV2ZW50KHR5cGUsIHRydWUsIHRydWUpO1xuICAgIH0gZWxzZSBpZiAoZG9jLmNyZWF0ZUV2ZW50T2JqZWN0KSB7XG4gICAgICBlID0gZG9jLmNyZWF0ZUV2ZW50T2JqZWN0KCk7XG4gICAgfVxuICAgIHJldHVybiBlO1xuICB9XG4gIGZ1bmN0aW9uIG1ha2VDdXN0b21FdmVudCAoKSB7XG4gICAgcmV0dXJuIG5ldyBjdXN0b21FdmVudCh0eXBlLCB7IGRldGFpbDogbW9kZWwgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gd3JhcHBlckZhY3RvcnkgKGVsLCB0eXBlLCBmbikge1xuICByZXR1cm4gZnVuY3Rpb24gd3JhcHBlciAob3JpZ2luYWxFdmVudCkge1xuICAgIHZhciBlID0gb3JpZ2luYWxFdmVudCB8fCBnbG9iYWwuZXZlbnQ7XG4gICAgZS50YXJnZXQgPSBlLnRhcmdldCB8fCBlLnNyY0VsZW1lbnQ7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCA9IGUucHJldmVudERlZmF1bHQgfHwgZnVuY3Rpb24gcHJldmVudERlZmF1bHQgKCkgeyBlLnJldHVyblZhbHVlID0gZmFsc2U7IH07XG4gICAgZS5zdG9wUHJvcGFnYXRpb24gPSBlLnN0b3BQcm9wYWdhdGlvbiB8fCBmdW5jdGlvbiBzdG9wUHJvcGFnYXRpb24gKCkgeyBlLmNhbmNlbEJ1YmJsZSA9IHRydWU7IH07XG4gICAgZS53aGljaCA9IGUud2hpY2ggfHwgZS5rZXlDb2RlO1xuICAgIGZuLmNhbGwoZWwsIGUpO1xuICB9O1xufVxuXG5mdW5jdGlvbiB3cmFwIChlbCwgdHlwZSwgZm4pIHtcbiAgdmFyIHdyYXBwZXIgPSB1bndyYXAoZWwsIHR5cGUsIGZuKSB8fCB3cmFwcGVyRmFjdG9yeShlbCwgdHlwZSwgZm4pO1xuICBoYXJkQ2FjaGUucHVzaCh7XG4gICAgd3JhcHBlcjogd3JhcHBlcixcbiAgICBlbGVtZW50OiBlbCxcbiAgICB0eXBlOiB0eXBlLFxuICAgIGZuOiBmblxuICB9KTtcbiAgcmV0dXJuIHdyYXBwZXI7XG59XG5cbmZ1bmN0aW9uIHVud3JhcCAoZWwsIHR5cGUsIGZuKSB7XG4gIHZhciBpID0gZmluZChlbCwgdHlwZSwgZm4pO1xuICBpZiAoaSkge1xuICAgIHZhciB3cmFwcGVyID0gaGFyZENhY2hlW2ldLndyYXBwZXI7XG4gICAgaGFyZENhY2hlLnNwbGljZShpLCAxKTsgLy8gZnJlZSB1cCBhIHRhZCBvZiBtZW1vcnlcbiAgICByZXR1cm4gd3JhcHBlcjtcbiAgfVxufVxuXG5mdW5jdGlvbiBmaW5kIChlbCwgdHlwZSwgZm4pIHtcbiAgdmFyIGksIGl0ZW07XG4gIGZvciAoaSA9IDA7IGkgPCBoYXJkQ2FjaGUubGVuZ3RoOyBpKyspIHtcbiAgICBpdGVtID0gaGFyZENhY2hlW2ldO1xuICAgIGlmIChpdGVtLmVsZW1lbnQgPT09IGVsICYmIGl0ZW0udHlwZSA9PT0gdHlwZSAmJiBpdGVtLmZuID09PSBmbikge1xuICAgICAgcmV0dXJuIGk7XG4gICAgfVxuICB9XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBldmVudG1hcCA9IFtdO1xudmFyIGV2ZW50bmFtZSA9ICcnO1xudmFyIHJvbiA9IC9eb24vO1xuXG5mb3IgKGV2ZW50bmFtZSBpbiBnbG9iYWwpIHtcbiAgaWYgKHJvbi50ZXN0KGV2ZW50bmFtZSkpIHtcbiAgICBldmVudG1hcC5wdXNoKGV2ZW50bmFtZS5zbGljZSgyKSk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBldmVudG1hcDtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGF0b2EgPSByZXF1aXJlKCdhdG9hJyk7XG52YXIgZXZlbnRzID0gW1xuICAgICdjYW5jZWwnLFxuICAgICdjbG9uZWQnLFxuICAgICdkcmFnJyxcbiAgICAnZHJhZ2VuZCcsXG4gICAgJ2Ryb3AnLFxuICAgICdvdXQnLFxuICAgICdvdmVyJyxcbiAgICAncmVtb3ZlJyxcbiAgICAnc2hhZG93JyxcbiAgICAnZHJhZy1tb2RlbCcsXG4gICAgJ2Ryb3AtbW9kZWwnLFxuICAgICdyZW1vdmUtbW9kZWwnXG5dO1xuXG5mdW5jdGlvbiByZXBsaWNhdGVFdmVudHMoYW5ndWxhciwgYmFnLCBzY29wZSkge1xuICAgIGV2ZW50cy5mb3JFYWNoKHJlcGxpY2F0b3IpO1xuXG4gICAgZnVuY3Rpb24gcmVwbGljYXRvcih0eXBlKSB7XG4gICAgICAgIGJhZy5kcmFrZS5vbih0eXBlLCByZXBsaWNhdGUpO1xuXG4gICAgICAgIGZ1bmN0aW9uIHJlcGxpY2F0ZSgpIHtcbiAgICAgICAgICAgIHZhciBhcmdzID0gYXRvYShhcmd1bWVudHMpLm1hcChhbmd1bGFyaXplKTtcbiAgICAgICAgICAgIGFyZ3MudW5zaGlmdChiYWcubmFtZSArICcuJyArIHR5cGUpO1xuICAgICAgICAgICAgc2NvcGUuJGVtaXQuYXBwbHkoc2NvcGUsIGFyZ3MpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYW5ndWxhcml6ZSh2YWx1ZSkge1xuICAgICAgICBpZiAoYW5ndWxhci5pc0VsZW1lbnQodmFsdWUpKSB7XG4gICAgICAgICAgICByZXR1cm4gYW5ndWxhci5lbGVtZW50KHZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHJlcGxpY2F0ZUV2ZW50cztcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGRyYWd1bGEgPSByZXF1aXJlKCdkcmFndWxhJyk7XG52YXIgZHJhZ3VsYUtleSA9ICckJGRyYWd1bGEnO1xudmFyIHJlcGxpY2F0ZUV2ZW50cyA9IHJlcXVpcmUoJy4vcmVwbGljYXRlLWV2ZW50cycpO1xuXG5mdW5jdGlvbiByZWdpc3Rlcihhbmd1bGFyKSB7XG4gICAgcmV0dXJuIFtmdW5jdGlvbiBkcmFndWxhU2VydmljZSgpIHtcblxuICAgICAgICB2YXIgY29udmVydE1vZGVsRnVuYyA9IHBhc3NUaHJvdWdoRnVuYyxcbiAgICAgICAgICAgIGRyYWdnZWRNb2RlbCxcbiAgICAgICAgICAgIGRyb3BwZWRNb2RlbDtcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgYWRkOiBhZGQsXG4gICAgICAgICAgICBmaW5kOiBmaW5kLFxuICAgICAgICAgICAgb3B0aW9uczogc2V0T3B0aW9ucyxcbiAgICAgICAgICAgIGRlc3Ryb3k6IGRlc3Ryb3ksXG4gICAgICAgICAgICBkcmFnZ2VkTW9kZWw6IGdldERyYWdnZWRNb2RlbCxcbiAgICAgICAgICAgIGRyb3BwZWRNb2RlbDogZ2V0RHJvcHBlZE1vZGVsLFxuICAgICAgICAgICAgY29udmVydE1vZGVsOiBjb252ZXJ0TW9kZWxcbiAgICAgICAgfTtcblxuICAgICAgICBmdW5jdGlvbiBoYW5kbGVNb2RlbHMoc2NvcGUsIGRyYWtlKSB7XG4gICAgICAgICAgICB2YXIgZHJhZ0VsbTtcbiAgICAgICAgICAgIHZhciBkcmFnSW5kZXg7XG4gICAgICAgICAgICB2YXIgZHJvcEluZGV4O1xuICAgICAgICAgICAgdmFyIHNvdXJjZU1vZGVsLFxuICAgICAgICAgICAgICAgIHNvdXJjZURhdGE7XG5cbiAgICAgICAgICAgIGRyYWtlLm9uKCdyZW1vdmUnLCBmdW5jdGlvbiByZW1vdmVNb2RlbChlbCwgc291cmNlKSB7XG4gICAgICAgICAgICAgICAgc291cmNlTW9kZWwgPSBkcmFrZS5tb2RlbHNbZHJha2UuY29udGFpbmVycy5pbmRleE9mKHNvdXJjZSldO1xuICAgICAgICAgICAgICAgIHNvdXJjZURhdGEgPSBkcmFrZS5kYXRhW2RyYWtlLmNvbnRhaW5lcnMuaW5kZXhPZihzb3VyY2UpXTtcbiAgICAgICAgICAgICAgICBzY29wZS4kYXBwbHlBc3luYyhmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciByZW1vdmVkTW9kZWxzID0gc291cmNlTW9kZWwuc3BsaWNlKGRyYWdJbmRleCwgMSk7XG4gICAgICAgICAgICAgICAgICAgIGRyYWtlLmVtaXQoJ3JlbW92ZS1tb2RlbCcsIHJlbW92ZWRNb2RlbHNbMF0sIHNvdXJjZU1vZGVsLCBzb3VyY2VEYXRhLCBkcmFnSW5kZXgpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGRyYWtlLm9uKCdkcmFnJywgZnVuY3Rpb24gKGVsLCBzb3VyY2UpIHtcbiAgICAgICAgICAgICAgICBkcmFnRWxtID0gZWw7XG4gICAgICAgICAgICAgICAgZHJhZ0luZGV4ID0gZG9tSW5kZXhPZihlbCwgc291cmNlKTtcbiAgICAgICAgICAgICAgICBzY29wZS4kYXBwbHlBc3luYyhmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIGNsZWFyTW9kZWxzKCk7XG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZU1vZGVsID0gZHJha2UubW9kZWxzW2RyYWtlLmNvbnRhaW5lcnMuaW5kZXhPZihzb3VyY2UpXTtcbiAgICAgICAgICAgICAgICAgICAgc291cmNlRGF0YSA9IGRyYWtlLmRhdGFbZHJha2UuY29udGFpbmVycy5pbmRleE9mKHNvdXJjZSldO1xuICAgICAgICAgICAgICAgICAgICBkcmFnZ2VkTW9kZWwgPSBzb3VyY2VNb2RlbFtkcmFnSW5kZXhdO1xuICAgICAgICAgICAgICAgICAgICBkcmFrZS5lbWl0KCdkcmFnLW1vZGVsJywgZHJhZ2dlZE1vZGVsLCBzb3VyY2VNb2RlbCwgc291cmNlRGF0YSwgZHJhZ0luZGV4KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBkcmFrZS5vbignY2FuY2VsJywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHNjb3BlLiRhcHBseUFzeW5jKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgY2xlYXJNb2RlbHMoKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBkcmFrZS5vbignZHJvcCcsIGZ1bmN0aW9uIChkcm9wRWxtLCB0YXJnZXQsIHNvdXJjZSkge1xuICAgICAgICAgICAgICAgIGRyb3BJbmRleCA9IGRvbUluZGV4T2YoZHJvcEVsbSwgdGFyZ2V0KTtcbiAgICAgICAgICAgICAgICBzY29wZS4kYXBwbHlBc3luYyhmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZU1vZGVsID0gZHJha2UubW9kZWxzW2RyYWtlLmNvbnRhaW5lcnMuaW5kZXhPZihzb3VyY2UpXTtcbiAgICAgICAgICAgICAgICAgICAgc291cmNlRGF0YSA9IGRyYWtlLmRhdGFbZHJha2UuY29udGFpbmVycy5pbmRleE9mKHNvdXJjZSldO1xuICAgICAgICAgICAgICAgICAgICB2YXIgdGFyZ2V0TW9kZWwsXG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXREYXRhO1xuICAgICAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ID09PSBzb3VyY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRyb3BwZWRNb2RlbCA9IHNvdXJjZU1vZGVsLnNwbGljZShkcmFnSW5kZXgsIDEpWzBdO1xuICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlTW9kZWwuc3BsaWNlKGRyb3BJbmRleCwgMCwgZHJvcHBlZE1vZGVsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldE1vZGVsID0gc291cmNlTW9kZWw7XG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXREYXRhID0gc291cmNlRGF0YTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBub3RDb3B5ID0gZHJhZ0VsbSA9PT0gZHJvcEVsbTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldE1vZGVsID0gZHJha2UubW9kZWxzW2RyYWtlLmNvbnRhaW5lcnMuaW5kZXhPZih0YXJnZXQpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldERhdGEgPSBkcmFrZS5kYXRhW2RyYWtlLmNvbnRhaW5lcnMuaW5kZXhPZih0YXJnZXQpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBkcm9wRWxtTW9kZWwgPSBub3RDb3B5ID8gZHJhZ2dlZE1vZGVsIDogYW5ndWxhci5jb3B5KGRyYWdnZWRNb2RlbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBkcm9wcGVkTW9kZWwgPSBjb252ZXJ0TW9kZWxGdW5jKGRyb3BFbG1Nb2RlbCwgc291cmNlTW9kZWwsIHNvdXJjZURhdGEsIHRhcmdldE1vZGVsLCB0YXJnZXREYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChub3RDb3B5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlTW9kZWwuc3BsaWNlKGRyYWdJbmRleCwgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXRNb2RlbC5zcGxpY2UoZHJvcEluZGV4LCAwLCBkcm9wcGVkTW9kZWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LnJlbW92ZUNoaWxkKGRyb3BFbG0pOyAvLyBlbGVtZW50IG11c3QgYmUgcmVtb3ZlZCBmb3IgbmdSZXBlYXQgdG8gYXBwbHkgY29ycmVjdGx5XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZHJha2UuZW1pdCgnZHJvcC1tb2RlbCcsIGRyb3BwZWRNb2RlbCwgc291cmNlTW9kZWwsIHNvdXJjZURhdGEsIHRhcmdldE1vZGVsLCB0YXJnZXREYXRhLCBkcm9wSW5kZXgpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjbGVhck1vZGVscygpIHtcbiAgICAgICAgICAgIGRyYWdnZWRNb2RlbCA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGRyb3BwZWRNb2RlbCA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGdldE9yQ3JlYXRlQ3R4KHNjb3BlKSB7XG4gICAgICAgICAgICB2YXIgY3R4ID0gc2NvcGVbZHJhZ3VsYUtleV07XG4gICAgICAgICAgICBpZiAoIWN0eCkge1xuICAgICAgICAgICAgICAgIGN0eCA9IHNjb3BlW2RyYWd1bGFLZXldID0ge1xuICAgICAgICAgICAgICAgICAgICBiYWdzOiBbXVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gY3R4O1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZG9tSW5kZXhPZihjaGlsZCwgcGFyZW50KSB7XG4gICAgICAgICAgICByZXR1cm4gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChhbmd1bGFyLmVsZW1lbnQocGFyZW50KS5jaGlsZHJlbigpLCBjaGlsZCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBhZGQoc2NvcGUsIG5hbWUsIGRyYWtlKSB7XG4gICAgICAgICAgICB2YXIgYmFnID0gZmluZChzY29wZSwgbmFtZSk7XG4gICAgICAgICAgICBpZiAoYmFnKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdCYWcgbmFtZWQ6IFwiJyArIG5hbWUgKyAnXCIgYWxyZWFkeSBleGlzdHMgaW4gc2FtZSBhbmd1bGFyIHNjb3BlLicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGN0eCA9IGdldE9yQ3JlYXRlQ3R4KHNjb3BlKTtcbiAgICAgICAgICAgIGJhZyA9IHtcbiAgICAgICAgICAgICAgICBuYW1lOiBuYW1lLFxuICAgICAgICAgICAgICAgIGRyYWtlOiBkcmFrZVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGN0eC5iYWdzLnB1c2goYmFnKTtcbiAgICAgICAgICAgIHJlcGxpY2F0ZUV2ZW50cyhhbmd1bGFyLCBiYWcsIHNjb3BlKTtcbiAgICAgICAgICAgIGlmIChkcmFrZS5tb2RlbHMpIHsgLy8gbW9kZWxzIHRvIHN5bmMgd2l0aCAobXVzdCBoYXZlIHNhbWUgc3RydWN0dXJlIGFzIGNvbnRhaW5lcnMpXG4gICAgICAgICAgICAgICAgaGFuZGxlTW9kZWxzKHNjb3BlLCBkcmFrZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gYmFnO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZmluZChzY29wZSwgbmFtZSkge1xuICAgICAgICAgICAgdmFyIGJhZ3MgPSBnZXRPckNyZWF0ZUN0eChzY29wZSkuYmFncztcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYmFncy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChiYWdzW2ldLm5hbWUgPT09IG5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGJhZ3NbaV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZGVzdHJveShzY29wZSwgbmFtZSkge1xuICAgICAgICAgICAgdmFyIGJhZ3MgPSBnZXRPckNyZWF0ZUN0eChzY29wZSkuYmFncztcbiAgICAgICAgICAgIHZhciBiYWcgPSBmaW5kKHNjb3BlLCBuYW1lKTtcbiAgICAgICAgICAgIHZhciBpID0gYmFncy5pbmRleE9mKGJhZyk7XG4gICAgICAgICAgICBiYWdzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgIGJhZy5kcmFrZS5kZXN0cm95KCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBzZXRPcHRpb25zKHNjb3BlLCBuYW1lLCBvcHRpb25zKSB7XG4gICAgICAgICAgICB2YXIgYmFnID0gYWRkKHNjb3BlLCBuYW1lLCBkcmFndWxhKG9wdGlvbnMpKTtcbiAgICAgICAgICAgIGhhbmRsZU1vZGVscyhzY29wZSwgYmFnLmRyYWtlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHBhc3NUaHJvdWdoRnVuYyhwYXNzZWRPYmplY3QpIHtcbiAgICAgICAgICAgIHJldHVybiBwYXNzZWRPYmplY3Q7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjb252ZXJ0TW9kZWwoY29udmVydEZ1bmMpIHtcbiAgICAgICAgICAgIGNvbnZlcnRNb2RlbEZ1bmMgPSBjb252ZXJ0RnVuYyB8fCBwYXNzVGhyb3VnaEZ1bmM7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBnZXREcmFnZ2VkTW9kZWwoKSB7XG4gICAgICAgICAgICByZXR1cm4gZHJhZ2dlZE1vZGVsO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZ2V0RHJvcHBlZE1vZGVsKCkge1xuICAgICAgICAgICAgcmV0dXJuIGRyb3BwZWRNb2RlbDtcbiAgICAgICAgfVxuICAgIH1dO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHJlZ2lzdGVyO1xuIl19
