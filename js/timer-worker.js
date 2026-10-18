// Span Focus - Dedicated Web Worker Ticker
// Same-origin file ticker immune to browser background tab throttling in Safari, Chrome and Firefox.
let tickerInterval = null;

self.onmessage = function(e) {
  if (e.data === 'start') {
    if (!tickerInterval) {
      tickerInterval = setInterval(function() {
        self.postMessage('tick');
      }, 1000);
    }
  } else if (e.data === 'stop') {
    if (tickerInterval) {
      clearInterval(tickerInterval);
      tickerInterval = null;
    }
  }
};
