"use strict";

const STORAGE_KEY = "dateExpenses";
const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

const elements = {
  form: document.getElementById("expenseForm"),
  date: document.getElementById("date"),
  title: document.getElementById("title"),
  amount: document.getElementById("amount"),
  payer: document.getElementById("payer"),
  addButton: document.getElementById("addButton"),
  cancelButton: document.getElementById("cancelButton"),
  formTitle: document.getElementById("formTitle"),
  monthPicker: document.getElementById("monthPicker"),
  previousMonth: document.getElementById("previousMonth"),
  nextMonth: document.getElementById("nextMonth"),
  history: document.getElementById("history"),
  total: document.getElementById("total"),
  myTotal: document.getElementById("myTotal"),
  partnerTotal: document.getElementById("partnerTotal"),
  settlementText: document.getElementById("settlementText"),
  expenseCount: document.getElementById("expenseCount")
};

let expenses = loadExpenses();
let editingId = null;

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadExpenses() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter(item => item && Number.isFinite(Number(item.amount)) && item.date)
      .map(item => ({
        id: Number(item.id) || Date.now() + Math.random(),
        date: String(item.date),
        title: String(item.title || "支出"),
        amount: Math.round(Number(item.amount)),
        payer: item.payer === "相手" ? "相手" : "自分"
      }));
  } catch (error) {
    console.warn("保存データを読み込めませんでした。", error);
    return [];
  }
}

function saveExpenses() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
  } catch (error) {
    alert("ブラウザへの保存に失敗しました。空き容量やプライベートブラウズ設定を確認してください。");
  }
}

function selectedExpenses() {
  return expenses.filter(expense => expense.date.slice(0, 7) === elements.monthPicker.value);
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function emptyState(message) {
  return createElement("div", "empty-state", message);
}

function resetForm() {
  editingId = null;
  elements.form.reset();
  elements.date.value = localDateString();
  elements.formTitle.textContent = "支出を追加";
  elements.addButton.textContent = "支出を追加";
  elements.cancelButton.hidden = true;
}

function submitExpense(event) {
  event.preventDefault();
  const amount = Math.round(Number(elements.amount.value));
  if (!elements.date.value || !elements.title.value.trim() || !Number.isFinite(amount) || amount <= 0) {
    alert("日付・内容・1円以上の金額を入力してください。");
    return;
  }

  const data = {
    id: editingId ?? Date.now(),
    date: elements.date.value,
    title: elements.title.value.trim(),
    amount,
    payer: elements.payer.value
  };

  if (editingId === null) expenses.push(data);
  else expenses = expenses.map(expense => expense.id === editingId ? data : expense);

  saveExpenses();
  elements.monthPicker.value = data.date.slice(0, 7);
  resetForm();
  render();
}

function editExpense(id) {
  const expense = expenses.find(item => item.id === id);
  if (!expense) return;
  editingId = id;
  elements.date.value = expense.date;
  elements.title.value = expense.title;
  elements.amount.value = expense.amount;
  elements.payer.value = expense.payer;
  elements.formTitle.textContent = "支出を編集";
  elements.addButton.textContent = "変更を保存";
  elements.cancelButton.hidden = false;
  document.querySelector(".form-area").scrollIntoView({ behavior: "smooth", block: "start" });
  elements.title.focus({ preventScroll: true });
}

function deleteExpense(id) {
  const expense = expenses.find(item => item.id === id);
  if (!expense || !confirm(`「${expense.title}」を削除しますか？`)) return;
  expenses = expenses.filter(item => item.id !== id);
  if (editingId === id) resetForm();
  saveExpenses();
  render();
}

function changeMonth(offset) {
  const [year, month] = elements.monthPicker.value.split("-").map(Number);
  const target = new Date(year, month - 1 + offset, 1);
  elements.monthPicker.value = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
  render();
}

function renderSummary(monthExpenses) {
  const total = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const myTotal = monthExpenses.filter(expense => expense.payer === "自分").reduce((sum, expense) => sum + expense.amount, 0);
  const partnerTotal = total - myTotal;
  elements.total.textContent = yen.format(total);
  elements.myTotal.textContent = yen.format(myTotal);
  elements.partnerTotal.textContent = yen.format(partnerTotal);
  elements.expenseCount.textContent = `${monthExpenses.length}件`;

  const difference = Math.abs(myTotal - partnerTotal) / 2;
  if (total === 0) elements.settlementText.textContent = "支出はまだありません";
  else if (difference === 0) elements.settlementText.textContent = "精算は不要です";
  else if (myTotal > partnerTotal) elements.settlementText.textContent = `相手 → 自分へ ${yen.format(difference)}`;
  else elements.settlementText.textContent = `自分 → 相手へ ${yen.format(difference)}`;
}

function renderHistory(monthExpenses) {
  elements.history.replaceChildren();
  if (!monthExpenses.length) {
    elements.history.append(emptyState("この月の支出はまだありません"));
    return;
  }
  [...monthExpenses].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).forEach(expense => {
    const item = createElement("article", "history-item");
    const main = createElement("div", "history-main");
    const details = document.createElement("div");
    details.append(createElement("div", "history-title", expense.title), createElement("div", "history-info", `${expense.date.replaceAll("-", "/")} ・ ${expense.payer}が支払い`));
    main.append(details, createElement("strong", "history-amount", yen.format(expense.amount)));
    const actions = createElement("div", "history-actions");
    const edit = createElement("button", "edit-button", "編集");
    edit.type = "button";
    edit.addEventListener("click", () => editExpense(expense.id));
    const remove = createElement("button", "delete-button", "削除");
    remove.type = "button";
    remove.addEventListener("click", () => deleteExpense(expense.id));
    actions.append(edit, remove);
    item.append(main, actions);
    elements.history.append(item);
  });
}

function render() {
  const monthExpenses = selectedExpenses();
  renderSummary(monthExpenses);
  renderHistory(monthExpenses);
}

elements.form.addEventListener("submit", submitExpense);
elements.cancelButton.addEventListener("click", resetForm);
elements.monthPicker.addEventListener("change", render);
elements.previousMonth.addEventListener("click", () => changeMonth(-1));
elements.nextMonth.addEventListener("click", () => changeMonth(1));

elements.monthPicker.value = localDateString().slice(0, 7);
resetForm();
render();
