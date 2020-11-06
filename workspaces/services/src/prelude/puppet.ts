import {
  Browser,
} from 'puppeteer';

import puppeteer from 'puppeteer-extra'

// @ts-ignore
import AnonPlugin from 'puppeteer-extra-plugin-anonymize-ua';
// @ts-ignore
import blockResources from 'puppeteer-extra-plugin-block-resources';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';


export  function useStealthPlugin(): void {
  puppeteer.use(StealthPlugin())
}

export function useAnonPlugin(): void {
  puppeteer.use(AnonPlugin())
}

export function useResourceBlockPlugin(): void {
  puppeteer.use(blockResources({
    blockedTypes: new Set(['image', 'stylesheet'])
  }));
}

export async function launchBrowser(): Promise<Browser> {
  const browser: Browser = await puppeteer.launch({
    // executablePath: 'google-chrome-stable'
    // devtools: true,
    // headless: false
  });

  return browser;
}
