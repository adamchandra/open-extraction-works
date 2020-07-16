/**
 * Various Utility functions
 */

import _ from "lodash";

export function pp(a: any): string {
  return JSON.stringify(a, undefined, 2);
}

export function getOrDie<T>(v: T | null | undefined, msg: string = "null|undef"): T {
  if (v === null || v === undefined) {
    throw new Error(`Error: ${msg}`);
  }
  return v;
}

/**
 */
export function corpusEntry(): string {
  const entry = location.href.split('/').reverse()[0].split('?')[0];
  return entry;
}

export function getParameterByName(name: string, urlstr?: string) {
  let url = urlstr;
  if (!url) url = window.location.href;
  const name0 = name.replace(/[[]]/g, "\\$&");
  const regex = new RegExp(`[?&]${name0}(=([^&#]*)|&|#|$)`);
  const results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return '';
  return decodeURIComponent(results[2].replace(/\+/g, " "));
}


export function newIdGenerator() {
  let currId = -1;
  const nextId = () => {
    currId +=1;
    return currId;
  };
  return nextId;
}

