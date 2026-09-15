const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const user = process.argv[2];
  const event = process.argv[3];
  const id = process.argv[4];
  const targetUrl = process.argv[5] || `https://embed.st/embed/${user}/${event}/${id}`;
  
  let hostName = 'embed.st';
  try { hostName = new URL(targetUrl).hostname; } catch(e) {}

  // Resolve real IP to bypass Indian ISP DNS sinkholes (Jio/Airtel)
  let realIp = '81.17.16.194'; // Fallback
  try {
      const dohRes = await fetch(`https://dns.google/resolve?name=${hostName}`);
      const dohJson = await dohRes.json();
      if (dohJson.Answer && dohJson.Answer.length > 0) {
          realIp = dohJson.Answer.find(a => a.type === 1 || a.type === 28).data;
      }
  } catch(e) {}

  const browser = await chromium.launch({ 
      headless: true,
      args: [`--host-resolver-rules=MAP ${hostName} ${realIp}`]
  });
  const page = await browser.newPage();
  
  // Create a promise to wait for the M3U8 string
  const m3u8Promise = new Promise(resolve => {
      page.exposeFunction('reportM3u8', (url) => {
        resolve(url);
      });
  });

  await page.addInitScript(() => {
    // Intercept M3U8 loaded natively by WASM in the browser
    const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            if (entry.name.includes('.m3u8')) {
                window.reportM3u8(entry.name);
            }
        }
    });
    observer.observe({entryTypes: ['resource']});
  });

  page.on('request', req => {
    if (req.url().includes('.m3u8')) {
        m3u8Promise.then(url => {
            if (url === req.url()) return; // Already resolved by observer
            // Fallback just in case
        });
    }
  });

  try {
      await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
      // Wait for the M3U8 to be fetched by the page
      const m3u8Url = await Promise.race([
          m3u8Promise,
          page.waitForTimeout(10000).then(() => null)
      ]);
      
      if (m3u8Url) {
          console.log(m3u8Url); // Exact output Nuvio expects
      } else {
          console.error("Timeout waiting for M3U8");
      }
  } catch(e) {
      console.error(e.message);
  } finally {
      await browser.close();
  }
})();
