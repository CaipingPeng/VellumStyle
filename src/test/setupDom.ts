import {JSDOM} from "jsdom";

const {window} = new JSDOM("<!doctype html><html><body></body></html>");

Object.defineProperties(globalThis, {
  window: {value: window, configurable: true},
  document: {value: window.document, configurable: true},
  DOMParser: {value: window.DOMParser, configurable: true},
  DocumentFragment: {value: window.DocumentFragment, configurable: true},
  Element: {value: window.Element, configurable: true},
  HTMLFormElement: {value: window.HTMLFormElement, configurable: true},
  HTMLTemplateElement: {value: window.HTMLTemplateElement, configurable: true},
  NamedNodeMap: {value: window.NamedNodeMap, configurable: true},
  Node: {value: window.Node, configurable: true},
  NodeFilter: {value: window.NodeFilter, configurable: true},
});
