const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_PATH = path.join(__dirname, 'data', 'entries.json');

app.use(express.json());
app.use(express.static(__dirname));

async function ensureDataFile() {
  try {
    await fs.access(DATA_PATH);
  } catch (error) {
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    const initial = { salary: 0, entries: [] };
    await fs.writeFile(DATA_PATH, JSON.stringify(initial, null, 2), 'utf-8');
  }
}

async function readData() {
  await ensureDataFile();
  const content = await fs.readFile(DATA_PATH, 'utf-8');
  if (!content.trim()) {
    return { salary: 0, entries: [] };
  }
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return { salary: 0, entries: parsed };
    }
    if (parsed && typeof parsed === 'object') {
      const salaryValue = Number(parsed.salary);
      const entriesValue = Array.isArray(parsed.entries) ? parsed.entries : [];
      return {
        salary: Number.isFinite(salaryValue) ? salaryValue : 0,
        entries: entriesValue
      };
    }
    return { salary: 0, entries: [] };
  } catch {
    return { salary: 0, entries: [] };
  }
}

async function writeData(data) {
  const safe = {
    salary: Number.isFinite(data.salary) ? data.salary : 0,
    entries: Array.isArray(data.entries) ? data.entries : []
  };
  await fs.writeFile(DATA_PATH, JSON.stringify(safe, null, 2), 'utf-8');
}

function sanitizeAmount(raw) {
  if (raw === null || raw === undefined) {
    return NaN;
  }
  let text = String(raw).toLowerCase();
  text = text.replace(/\beuros?\b/g, '');
  text = text.replace(/\beur\b/g, '');
  text = text.replace(/€|\s/g, '');
  text = text.replace(/,/g, '.');
  text = text.replace(/[a-z]/gi, '');
  const parsed = parseFloat(text);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function calculateTotals(data) {
  const salary = Number.isFinite(data.salary) ? data.salary : 0;
  const entries = Array.isArray(data.entries) ? data.entries : [];
  const expenses = entries.filter(entry => (entry.type || 'expense') === 'expense');
  const totalExpenses = expenses.reduce((sum, entry) => sum + (entry.amount || 0), 0);
  const remaining = salary - totalExpenses;
  return {
    salary,
    totalExpenses,
    remaining
  };
}

app.get('/api/entries', async (req, res) => {
  try {
    const data = await readData();
    const totals = calculateTotals(data);
    res.json({
      entries: data.entries,
      salary: totals.salary,
      totalExpenses: totals.totalExpenses,
      remaining: totals.remaining,
      total: totals.totalExpenses
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read entries.' });
  }
});

app.post('/api/entries', async (req, res) => {
  try {
    const { amount, rawValue, label } = req.body || {};

    const normalizedAmount = typeof amount === 'number' && Number.isFinite(amount)
      ? amount
      : sanitizeAmount(rawValue ?? amount);

    if (!Number.isFinite(normalizedAmount)) {
      return res.status(400).json({ error: 'Invalid amount value.' });
    }

    const entry = {
      id: req.body?.id || `entry_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      amount: normalizedAmount,
      rawValue: (rawValue ?? amount ?? '').toString().trim(),
      label: (label ?? '').toString().trim(),
      createdAt: Date.now(),
      type: 'expense'
    };

    const data = await readData();
    const entries = Array.isArray(data.entries) ? data.entries : [];
    entries.unshift(entry);
    const updated = { ...data, entries };
    await writeData(updated);
    const totals = calculateTotals(updated);

    res.status(201).json({
      entry,
      salary: totals.salary,
      totalExpenses: totals.totalExpenses,
      remaining: totals.remaining,
      total: totals.totalExpenses
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save entry.' });
  }
});

app.delete('/api/entries/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const data = await readData();
    const entries = Array.isArray(data.entries) ? data.entries : [];
    const nextEntries = entries.filter(entry => entry.id !== id);

    if (nextEntries.length === entries.length) {
      return res.status(404).json({ error: 'Entry not found.' });
    }

    const updated = { ...data, entries: nextEntries };
    await writeData(updated);
    const totals = calculateTotals(updated);

    res.json({
      salary: totals.salary,
      totalExpenses: totals.totalExpenses,
      remaining: totals.remaining,
      total: totals.totalExpenses
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove entry.' });
  }
});

app.post('/api/entries/reset', async (req, res) => {
  try {
    const resetData = { salary: 0, entries: [] };
    await writeData(resetData);
    res.json({
      message: 'All entries cleared.',
      salary: 0,
      totalExpenses: 0,
      remaining: 0,
      total: 0
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear entries.' });
  }
});

app.post('/api/salary', async (req, res) => {
  try {
    const { amount } = req.body || {};
    const normalizedAmount = typeof amount === 'number' && Number.isFinite(amount)
      ? amount
      : sanitizeAmount(amount);

    if (!Number.isFinite(normalizedAmount)) {
      return res.status(400).json({ error: 'Invalid salary amount.' });
    }

    const data = await readData();
    const updated = { ...data, salary: normalizedAmount };
    await writeData(updated);
    const totals = calculateTotals(updated);

    res.json({
      salary: totals.salary,
      totalExpenses: totals.totalExpenses,
      remaining: totals.remaining,
      total: totals.totalExpenses
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update salary.' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Expense tracker server running on http://localhost:${PORT}`);
});


