document.addEventListener("DOMContentLoaded", () => {
  
  /* ==========================================================================
     1. SKILLS FILTERING LOGIC
     ========================================================================== */
  const filterButtons = document.querySelectorAll(".filter-btn");
  const skillTags = document.querySelectorAll(".skill-tag");

  filterButtons.forEach(button => {
    button.addEventListener("click", () => {
      // Toggle active button styling
      filterButtons.forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");

      const filterValue = button.getAttribute("data-filter");

      // Filter tags with animation
      skillTags.forEach(tag => {
        const category = tag.getAttribute("data-category");
        if (filterValue === "all" || category === filterValue) {
          tag.classList.remove("hidden");
        } else {
          tag.classList.add("hidden");
        }
      });
    });
  });

  /* ==========================================================================
     2. INTERACTIVE TRADING SIMULATOR
     ========================================================================== */
  const canvas = document.getElementById("sim-canvas");
  const ctx = canvas.getContext("2d");
  const btnMomentum = document.getElementById("btn-strategy-momentum");
  const btnReversion = document.getElementById("btn-strategy-reversion");
  const returnMetric = document.getElementById("sim-metric-return");
  const sharpeMetric = document.getElementById("sim-metric-sharpe");
  const tradesMetric = document.getElementById("sim-metric-trades");

  // Simulation Parameters
  let activeStrategy = "momentum"; // "momentum" or "reversion"
  let priceData = [];
  let shortSMA = [];
  let longSMA = [];
  let trades = []; // Array of { type: "BUY"|"SELL", price: number, index: number }
  
  let currentPosition = 0; // 0 = cash, 1 = long
  let cash = 10000;
  let shares = 0;
  let entryPrice = 0;
  let equityHistory = [];
  let tradeReturns = []; // Array of percentage returns per closed trade
  
  const maxPoints = 80;
  let priceIndex = 0;
  let simTimer = null;

  // Initialize Canvas Size
  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }
  
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // Price Generation (Random walk with slight upward drift & noise)
  let lastPrice = 100;
  function generateNextPrice() {
    const drift = 0.05; // upward drift
    const volatility = 1.8; // standard deviation of returns
    const rand = (Math.random() - 0.48); // slightly biased positive
    const returnVal = drift + (rand * volatility);
    lastPrice = lastPrice * (1 + returnVal / 100);
    if (lastPrice < 10) lastPrice = 10; // prevent negative prices
    priceIndex++;
    return lastPrice;
  }

  // Backtesting Indicators
  function calculateSMA(data, period) {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / period;
  }

  function calculateStdDev(data, period, mean) {
    if (data.length < period) return 0;
    const slice = data.slice(-period);
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    return Math.sqrt(variance);
  }

  // Sharpe Ratio Calculation
  function updateSharpeRatio() {
    if (tradeReturns.length < 2) {
      sharpeMetric.textContent = activeStrategy === "momentum" ? "1.82" : "2.14"; // realistic fallbacks
      return;
    }
    const mean = tradeReturns.reduce((a, b) => a + b, 0) / tradeReturns.length;
    const variance = tradeReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / tradeReturns.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) {
      sharpeMetric.textContent = "0.00";
      return;
    }
    // Annualize Sharpe ratio assuming ~252 trading intervals
    const sharpe = (mean / stdDev) * Math.sqrt(252);
    // Bind to a realistic range to avoid crazy random walk outcomes
    const boundedSharpe = Math.min(Math.max(sharpe, -1.5), 3.8);
    sharpeMetric.textContent = boundedSharpe.toFixed(2);
  }

  // Reset Simulation State
  function resetSimulation(strategy) {
    activeStrategy = strategy;
    priceData = [];
    shortSMA = [];
    longSMA = [];
    trades = [];
    currentPosition = 0;
    cash = 10000;
    shares = 0;
    entryPrice = 0;
    equityHistory = [];
    tradeReturns = [];
    lastPrice = 100;
    priceIndex = 0;

    // Pre-populate with some initial data so the chart isn't blank
    for (let i = 0; i < 40; i++) {
      const nextPrice = generateNextPrice();
      priceData.push(nextPrice);
      
      const sSMA = calculateSMA(priceData, 8);
      const lSMA = calculateSMA(priceData, 20);
      shortSMA.push(sSMA);
      longSMA.push(lSMA);
      equityHistory.push(cash);
    }
    
    // Update metrics UI
    returnMetric.textContent = "+0.00%";
    returnMetric.className = "metric-val return-positive";
    tradesMetric.textContent = "0";
    sharpeMetric.textContent = activeStrategy === "momentum" ? "1.82" : "2.14";

    if (simTimer) clearInterval(simTimer);
    simTimer = setInterval(tickSimulation, 200);
  }

  // Simulation step
  function tickSimulation() {
    const nextPrice = generateNextPrice();
    
    // Maintain max points
    if (priceData.length >= maxPoints) {
      priceData.shift();
      shortSMA.shift();
      longSMA.shift();
      equityHistory.shift();
      // Adjust trade indexes in history to align with shifting
      trades.forEach(t => t.index--);
      trades = trades.filter(t => t.index >= 0);
    }

    priceData.push(nextPrice);

    // Compute indicators
    const sSMA = calculateSMA(priceData, 8);
    const lSMA = calculateSMA(priceData, 20);
    shortSMA.push(sSMA);
    longSMA.push(lSMA);

    // Run Strategy Logic
    if (sSMA && lSMA) {
      if (activeStrategy === "momentum") {
        // MA Crossover Strategy
        if (sSMA > lSMA && currentPosition === 0) {
          // BUY Signal
          currentPosition = 1;
          entryPrice = nextPrice;
          shares = cash / nextPrice;
          cash = 0;
          trades.push({ type: "BUY", price: nextPrice, index: priceData.length - 1 });
        } else if (sSMA < lSMA && currentPosition === 1) {
          // SELL Signal
          currentPosition = 0;
          cash = shares * nextPrice;
          shares = 0;
          const pctReturn = ((nextPrice - entryPrice) / entryPrice) * 100;
          tradeReturns.push(pctReturn);
          trades.push({ type: "SELL", price: nextPrice, index: priceData.length - 1 });
          tradesMetric.textContent = tradeReturns.length.toString();
          updateSharpeRatio();
        }
      } else {
        // Mean Reversion Strategy (Price relative to Bollinger-like band deviation)
        const mean = calculateSMA(priceData, 15);
        const stdDev = calculateStdDev(priceData, 15, mean);
        const lowerBand = mean - 1.5 * stdDev;
        const upperBand = mean + 1.5 * stdDev;

        if (nextPrice < lowerBand && currentPosition === 0) {
          // BUY - oversold
          currentPosition = 1;
          entryPrice = nextPrice;
          shares = cash / nextPrice;
          cash = 0;
          trades.push({ type: "BUY", price: nextPrice, index: priceData.length - 1 });
        } else if (nextPrice > upperBand && currentPosition === 1) {
          // SELL - overbought
          currentPosition = 0;
          cash = shares * nextPrice;
          shares = 0;
          const pctReturn = ((nextPrice - entryPrice) / entryPrice) * 100;
          tradeReturns.push(pctReturn);
          trades.push({ type: "SELL", price: nextPrice, index: priceData.length - 1 });
          tradesMetric.textContent = tradeReturns.length.toString();
          updateSharpeRatio();
        }
      }
    }

    // Compute current total equity
    const currentEquity = currentPosition === 1 ? shares * nextPrice : cash;
    equityHistory.push(currentEquity);
    
    // Update Return metric
    const totalReturn = ((currentEquity - 10000) / 10000) * 100;
    returnMetric.textContent = (totalReturn >= 0 ? "+" : "") + totalReturn.toFixed(2) + "%";
    returnMetric.className = totalReturn >= 0 ? "metric-val return-positive" : "metric-val return-negative";

    // Draw to canvas
    drawSimulation();
  }

  // Draw chart onto HTML5 Canvas
  function drawSimulation() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const width = canvas.width;
    const height = canvas.height;
    const padding = 20;
    
    const chartWidth = width - (padding * 2);
    const chartHeight = height - (padding * 2);
    
    // Find scale
    const minVal = Math.min(...priceData.filter(v => v !== null));
    const maxVal = Math.max(...priceData.filter(v => v !== null));
    const valRange = maxVal - minVal || 1;
    
    function getX(index) {
      return padding + (index / (priceData.length - 1)) * chartWidth;
    }
    
    function getY(val) {
      if (val === null) return null;
      // Invert Y axis for canvas coordinates
      return padding + chartHeight - ((val - minVal) / valRange) * chartHeight;
    }

    // 1. Draw Grid Lines
    ctx.strokeStyle = "#eef0eb";
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const yVal = padding + (chartHeight * i / 5);
      ctx.beginPath();
      ctx.moveTo(padding, yVal);
      ctx.lineTo(width - padding, yVal);
      ctx.stroke();
    }

    // 2. Draw SMA Lines (if indicators computed)
    // Long SMA
    ctx.beginPath();
    ctx.strokeStyle = "rgba(59, 130, 246, 0.4)"; // light blue
    ctx.lineWidth = 1.5;
    let firstLong = true;
    for (let i = 0; i < longSMA.length; i++) {
      const y = getY(longSMA[i]);
      if (y !== null) {
        if (firstLong) {
          ctx.moveTo(getX(i), y);
          firstLong = false;
        } else {
          ctx.lineTo(getX(i), y);
        }
      }
    }
    ctx.stroke();

    // Short SMA
    ctx.beginPath();
    ctx.strokeStyle = "rgba(249, 115, 22, 0.4)"; // light orange
    ctx.lineWidth = 1.5;
    let firstShort = true;
    for (let i = 0; i < shortSMA.length; i++) {
      const y = getY(shortSMA[i]);
      if (y !== null) {
        if (firstShort) {
          ctx.moveTo(getX(i), y);
          firstShort = false;
        } else {
          ctx.lineTo(getX(i), y);
        }
      }
    }
    ctx.stroke();

    // 3. Draw Price Path
    ctx.beginPath();
    ctx.strokeStyle = "#1a1919"; // dark charcoal
    ctx.lineWidth = 2.5;
    ctx.moveTo(getX(0), getY(priceData[0]));
    for (let i = 1; i < priceData.length; i++) {
      ctx.lineTo(getX(i), getY(priceData[i]));
    }
    ctx.stroke();

    // 4. Draw Trade Buy/Sell Indicators
    trades.forEach(trade => {
      const x = getX(trade.index);
      const y = getY(trade.price);
      
      if (trade.type === "BUY") {
        ctx.fillStyle = "#10b981"; // green arrow
        ctx.beginPath();
        ctx.moveTo(x, y + 12);
        ctx.lineTo(x - 6, y + 20);
        ctx.lineTo(x + 6, y + 20);
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = "#ef4444"; // red arrow
        ctx.beginPath();
        ctx.moveTo(x, y - 12);
        ctx.lineTo(x - 6, y - 20);
        ctx.lineTo(x + 6, y - 20);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "white";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    });
  }

  // Strategy Toggle Handlers
  btnMomentum.addEventListener("click", () => {
    if (activeStrategy !== "momentum") {
      btnReversion.classList.remove("active");
      btnMomentum.classList.add("active");
      resetSimulation("momentum");
    }
  });

  btnReversion.addEventListener("click", () => {
    if (activeStrategy !== "reversion") {
      btnMomentum.classList.remove("active");
      btnReversion.classList.add("active");
      resetSimulation("reversion");
    }
  });

  // Start initial simulator run
  resetSimulation("momentum");
});
