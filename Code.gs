/**
 * Serves the HTML file for the web app dashboard.
 */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('মাছের খামারের বার্ষিক লাভ-লোকসান বিশ্লেষণ');
}

/**
 * Includes an HTML file into another.
 * This is a common pattern for including CSS/JS/other HTML partials.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename)
      .getContent();
}/**
 * Fetches and processes data from the Google Sheet for the dashboard.
 * @returns {Object} An object containing KPI, income, expense, and monthly data.
 */
function getDashboardData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const transactionSheet = ss.getSheetByName('Transactions (লেনদেন)'); // Ensure this is the exact sheet name
  const summarySheet = ss.getSheetByName('Summary (সারসংক্ষেপ)');     // Ensure this is the exact sheet name

  if (!transactionSheet) {
    throw new Error("Sheet named 'Transactions' not found.");
  }

  const data = transactionSheet.getDataRange().getValues();

  // Assuming headers are in the first row
  const headers = data[0];
  const transactions = data.slice(1); // Actual transaction data

  // Find column indices dynamically using the EXACT headers from your sheet screenshot
  const dateCol = headers.indexOf('Date (তারিখ)');
  const typeCol = headers.indexOf('Type (ধরণ)');
  const categoryCol = headers.indexOf('Category (খাত)');
  const amountCol = headers.indexOf('Amount (পরিমাণ)');
  const monthCol = headers.indexOf('Month (মাস)');
  const yearCol = headers.indexOf('Year (বছর)');

  // Validate that all columns were found
  if (dateCol === -1 || typeCol === -1 || categoryCol === -1 || amountCol === -1 || monthCol === -1 || yearCol === -1) {
    throw new Error("One or more required column headers not found in 'Transactions' sheet. Please check spelling: Date (তারিখ), Type (ধরণ), Category (খাত), Amount (পরিমাণ), Month (মাস), Year (বছর)");
  }

  // --- 1. Calculate KPIs (from Summary Sheet if available, or dynamically) ---
  let totalIncome = 0;
  let totalExpense = 0;
  let netProfit = 0;
  let profitMargin = 0;

  // Prefer reading from Summary sheet if it exists and has the data
  if (summarySheet) {
    const summaryData = summarySheet.getDataRange().getValues();
    for (let i = 0; i < summaryData.length; i++) {
      if (summaryData[i][0] === 'Total Income:') {
        totalIncome = parseFloat(summaryData[i][1]);
      } else if (summaryData[i][0] === 'Total Expense:') {
        totalExpense = parseFloat(summaryData[i][1]);
      } else if (summaryData[i][0] === 'Net Profit:') {
        netProfit = parseFloat(summaryData[i][1]);
      } else if (summaryData[i][0] === 'Profit Margin:') {
        profitMargin = parseFloat(summaryData[i][1]) * 100; // Convert to percentage
      }
    }
  } else { // Fallback if Summary sheet doesn't exist or doesn't have data
    transactions.forEach(row => {
      const typeValue = row[typeCol] ? row[typeCol].toString().trim() : '';
      const amount = parseAmount(row[amountCol]); // Use helper function for amount
      if (!isNaN(amount)) {
        // ▼▼▼ FIX #1 WAS HERE ▼▼▼
        if (typeValue.includes('Income')) {
          totalIncome += amount;
        // ▼▼▼ FIX #2 WAS HERE ▼▼▼
        } else if (typeValue.includes('Expense')) {
          totalExpense += amount;
        }
      }
    });
    netProfit = totalIncome - totalExpense;
    profitMargin = totalIncome === 0 ? 0 : (netProfit / totalIncome) * 100;
  }

  // --- 2. Process Income Sources ---
  const incomeSources = {};
  const expenseCategories = {};
  const monthlyIncome = Array(12).fill(0);
  const monthlyExpense = Array(12).fill(0);

  // Moved monthMap outside the loop for better performance
  const monthMap = {
    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
  };

  transactions.forEach(row => {
    const typeValue = row[typeCol] ? row[typeCol].toString().trim() : '';
    const category = row[categoryCol] ? row[categoryCol].toString().trim() : 'Unknown';
    const amount = parseAmount(row[amountCol]);
    const month = row[monthCol] ? row[monthCol].toString().trim() : '';
    const monthIndex = monthMap[month];

    if (!isNaN(amount) && amount > 0) {
      // ▼▼▼ FIX #3 WAS HERE ▼▼▼
      if (typeValue.includes('Income')) {
        incomeSources[category] = (incomeSources[category] || 0) + amount;
        if (monthIndex !== undefined) {
            monthlyIncome[monthIndex] += amount;
        }
      // ▼▼▼ FIX #4 WAS HERE ▼▼▼
      } else if (typeValue.includes('Expense')) {
        expenseCategories[category] = (expenseCategories[category] || 0) + amount;
        if (monthIndex !== undefined) {
            monthlyExpense[monthIndex] += amount;
        }
      }
    }
  });

  // Convert objects to arrays for Chart.js
  const incomeLabels = Object.keys(incomeSources);
  const incomeData = Object.values(incomeSources);

  const expenseLabels = Object.keys(expenseCategories);
  const expenseData = Object.values(expenseCategories);

  // Sort expense categories by amount (descending)
  const sortedExpense = expenseLabels.map((label, index) => ({
    label: label,
    data: expenseData[index]
  })).sort((a, b) => b.data - a.data);

  const finalExpenseLabels = sortedExpense.map(item => item.label);
  const finalExpenseData = sortedExpense.map(item => item.data);

  return {
    kpi: {
      totalIncome: totalIncome,
      totalExpense: totalExpense,
      netProfit: netProfit,
      profitMargin: profitMargin
    },
    income: {
      labels: incomeLabels,
      data: incomeData
    },
    expense: {
      labels: finalExpenseLabels,
      data: finalExpenseData
    },
    monthly: {
      income: monthlyIncome,
      expense: monthlyExpense
    }
  };
}
/**
 * Helper function to parse amount, removing non-numeric characters like '৳'.
 * @param {any} value The value from the amount cell.
 * @returns {number} The parsed numeric amount.
 */
function parseAmount(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    // Remove '৳', commas, and then parse
    const cleanValue = value.replace(/৳/g, '').replace(/,/g, '').trim();
    return parseFloat(cleanValue);
  }
  return NaN;
}
