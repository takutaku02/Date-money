"use strict";

const STORAGE_KEYS = {
  expenses: "dateExpenses.expenses.v1",
  settlements: "dateExpenses.settlements.v1",
  lastBackupAt: "dateExpenses.lastBackupAt.v1",
  restoreExpenses: "dateExpenses.restore.expenses.tmp",
  restoreSettlements: "dateExpenses.restore.settlements.tmp"
};
const BACKUP_VERSION = 1;
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
  expenseCount: document.getElementById("expenseCount"),
  repaidTotal: document.getElementById("repaidTotal"),
  showSettlementButton: document.getElementById("showSettlementButton"),
  settlementFormArea: document.getElementById("settlementFormArea"),
  settlementForm: document.getElementById("settlementForm"),
  settlementFormTitle: document.getElementById("settlementFormTitle"),
  settlementDate: document.getElementById("settlementDate"),
  settlementDirection: document.getElementById("settlementDirection"),
  settlementAmount: document.getElementById("settlementAmount"),
  cancelSettlementButton: document.getElementById("cancelSettlementButton"),
  saveSettlementButton: document.getElementById("saveSettlementButton"),
  lastBackupAt: document.getElementById("lastBackupAt"),
  exportBackupButton: document.getElementById("exportBackupButton"),
  importBackupButton: document.getElementById("importBackupButton"),
  backupFileInput: document.getElementById("backupFileInput")
};

let expenses = [];
let settlements = [];
let editingId = null;
let editingSettlementId = null;

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeExpense(item) {
  return {
    id: String(item.id),
    created_at: String(item.created_at || ""),
    date: String(item.date),
    title: String(item.title || "支出"),
    amount: Math.round(Number(item.amount)),
    payer: item.payer === "相手" ? "相手" : "自分"
  };
}

function normalizeSettlement(item) {
  return {
    id: String(item.id),
    created_at: String(item.created_at || ""),
    date: String(item.date),
    from_person: item.from_person === "自分" ? "自分" : "相手",
    to_person: item.to_person === "自分" ? "自分" : "相手",
    amount: Math.round(Number(item.amount))
  };
}

function selectedExpenses() {
  return expenses.filter(expense => expense.date.slice(0, 7) === elements.monthPicker.value);
}

function selectedSettlements() {
  return settlements.filter(settlement => settlement.date.slice(0, 7) === elements.monthPicker.value);
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

function loadList(key, normalize) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(value)) throw new Error("保存データの形式が不正です。");
    return value
      .filter(item => item && item.id != null && item.date && Number.isFinite(Number(item.amount)) && Number(item.amount) > 0)
      .map(normalize);
  } catch (error) {
    console.error("端末内の保存データを読み込めませんでした。", error);
    alert("端末内の保存データを読み込めませんでした。データは変更せず、空の状態で表示します。");
    return [];
  }
}

function saveList(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error("端末内にデータを保存できませんでした。", error);
    alert("端末内にデータを保存できませんでした。ブラウザの空き容量やプライベートブラウズ設定を確認してください。");
    return false;
  }
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateCommonItem(item, type, index, ids) {
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`${type}${index + 1}件目の形式が正しくありません。`);
  if ((typeof item.id !== "string" && typeof item.id !== "number") || String(item.id).trim() === "") throw new Error(`${type}${index + 1}件目のIDが不正です。`);
  const id = String(item.id);
  if (ids.has(id)) throw new Error(`${type}に重複したIDがあります。`);
  ids.add(id);
  if (!isValidDate(item.date)) throw new Error(`${type}${index + 1}件目の日付が不正です。`);
  if (!Number.isSafeInteger(item.amount) || item.amount <= 0) throw new Error(`${type}${index + 1}件目の金額が不正です。`);
  if (item.created_at != null && typeof item.created_at !== "string") throw new Error(`${type}${index + 1}件目の作成日時が不正です。`);
}

function validateBackup(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("バックアップの形式が正しくありません。");
  if (data.version !== BACKUP_VERSION) throw new Error("対応していないバックアップのバージョンです。");
  if (typeof data.exportedAt !== "string" || !Number.isFinite(Date.parse(data.exportedAt))) throw new Error("書き出し日時が不正です。");
  if (!Array.isArray(data.expenses) || !Array.isArray(data.settlements)) throw new Error("支出または精算データがありません。");

  const expenseIds = new Set();
  const settlementIds = new Set();
  data.expenses.forEach((item, index) => {
    validateCommonItem(item, "支出", index, expenseIds);
    if (typeof item.title !== "string" || item.title.trim() === "") throw new Error(`支出${index + 1}件目の内容が不正です。`);
    if (item.payer !== "自分" && item.payer !== "相手") throw new Error(`支出${index + 1}件目の支払者が不正です。`);
  });
  data.settlements.forEach((item, index) => {
    validateCommonItem(item, "精算", index, settlementIds);
    const validDirection = (item.from_person === "自分" && item.to_person === "相手")
      || (item.from_person === "相手" && item.to_person === "自分");
    if (!validDirection) throw new Error(`精算${index + 1}件目の返済方向が不正です。`);
  });

  return {
    expenses: data.expenses.map(normalizeExpense),
    settlements: data.settlements.map(normalizeSettlement)
  };
}

function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "未実施";
  const parts = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}/${part("month")}/${part("day")} ${part("hour")}:${part("minute")}`;
}

function renderLastBackupAt() {
  const value = localStorage.getItem(STORAGE_KEYS.lastBackupAt);
  elements.lastBackupAt.textContent = `最終バックアップ日時：${value ? formatDateTime(value) : "未実施"}`;
}

function exportBackup() {
  const exportedAt = new Date().toISOString();
  const backup = { version: BACKUP_VERSION, exportedAt, expenses, settlements };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `date-money-backup-${localDateString()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);

  try {
    localStorage.setItem(STORAGE_KEYS.lastBackupAt, exportedAt);
    renderLastBackupAt();
  } catch (error) {
    console.error("最終バックアップ日時を保存できませんでした。", error);
    alert("バックアップを書き出しましたが、最終バックアップ日時を保存できませんでした。");
  }
}

function restoreRawValue(key, value) {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
}

function replaceStoredData(restored) {
  const nextExpenses = JSON.stringify(restored.expenses);
  const nextSettlements = JSON.stringify(restored.settlements);
  const previousExpenses = localStorage.getItem(STORAGE_KEYS.expenses);
  const previousSettlements = localStorage.getItem(STORAGE_KEYS.settlements);

  try {
    localStorage.setItem(STORAGE_KEYS.restoreExpenses, nextExpenses);
    localStorage.setItem(STORAGE_KEYS.restoreSettlements, nextSettlements);
    if (localStorage.getItem(STORAGE_KEYS.restoreExpenses) !== nextExpenses
      || localStorage.getItem(STORAGE_KEYS.restoreSettlements) !== nextSettlements) {
      throw new Error("一時保存データを確認できませんでした。");
    }
    localStorage.setItem(STORAGE_KEYS.expenses, nextExpenses);
    localStorage.setItem(STORAGE_KEYS.settlements, nextSettlements);
    if (localStorage.getItem(STORAGE_KEYS.expenses) !== nextExpenses
      || localStorage.getItem(STORAGE_KEYS.settlements) !== nextSettlements) {
      throw new Error("復元したデータを確認できませんでした。");
    }
  } catch (error) {
    let rollbackFailed = false;
    try {
      restoreRawValue(STORAGE_KEYS.expenses, previousExpenses);
      restoreRawValue(STORAGE_KEYS.settlements, previousSettlements);
    } catch (rollbackError) {
      console.error("元データの復旧に失敗しました。", rollbackError);
      rollbackFailed = true;
    }
    if (rollbackFailed) throw new Error("復元に失敗し、元データを完全に戻せませんでした。");
    throw error;
  } finally {
    try {
      localStorage.removeItem(STORAGE_KEYS.restoreExpenses);
      localStorage.removeItem(STORAGE_KEYS.restoreSettlements);
    } catch (cleanupError) {
      console.error("一時データを削除できませんでした。", cleanupError);
    }
  }
}

async function importBackupFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  try {
    const restored = validateBackup(JSON.parse(await file.text()));
    if (!confirm("現在のデータをバックアップデータで置き換えますか？")) return;
    replaceStoredData(restored);
    expenses = restored.expenses;
    settlements = restored.settlements;
    editingId = null;
    editingSettlementId = null;
    resetForm();
    resetSettlementForm();
    render();
    alert("バックアップからデータを復元しました。");
  } catch (error) {
    console.error("バックアップを読み込めませんでした。", error);
    alert(`バックアップを読み込めませんでした。現在のデータは変更されていません。\n${error.message}`);
  }
}

function resetForm() {
  editingId = null;
  elements.form.reset();
  elements.date.value = localDateString();
  elements.formTitle.textContent = "支出を追加";
  elements.addButton.textContent = "支出を追加";
  elements.cancelButton.hidden = true;
}

function resetSettlementForm() {
  editingSettlementId = null;
  elements.settlementForm.reset();
  elements.settlementDate.value = localDateString();
  elements.settlementFormTitle.textContent = "精算を記録";
  elements.saveSettlementButton.textContent = "精算を保存";
  elements.settlementFormArea.hidden = true;
  elements.showSettlementButton.hidden = false;
}

function showSettlementForm() {
  elements.settlementFormArea.hidden = false;
  elements.showSettlementButton.hidden = true;
  elements.settlementFormArea.scrollIntoView({ behavior: "smooth", block: "start" });
}

function submitExpense(event) {
  event.preventDefault();
  const amount = Math.round(Number(elements.amount.value));
  if (!elements.date.value || !elements.title.value.trim() || !Number.isFinite(amount) || amount <= 0) {
    alert("日付・内容・1円以上の金額を入力してください。");
    return;
  }

  const savedExpense = {
    id: editingId || createId(),
    created_at: editingId
      ? expenses.find(item => item.id === editingId)?.created_at || new Date().toISOString()
      : new Date().toISOString(),
    date: elements.date.value,
    title: elements.title.value.trim(),
    amount,
    payer: elements.payer.value
  };
  const nextExpenses = editingId === null
    ? [...expenses, savedExpense]
    : expenses.map(expense => expense.id === editingId ? savedExpense : expense);
  if (!saveList(STORAGE_KEYS.expenses, nextExpenses)) return;
  expenses = nextExpenses;
  elements.monthPicker.value = savedExpense.date.slice(0, 7);
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
  const nextExpenses = expenses.filter(item => item.id !== id);
  if (!saveList(STORAGE_KEYS.expenses, nextExpenses)) return;
  expenses = nextExpenses;
  if (editingId === id) resetForm();
  render();
}

function submitSettlement(event) {
  event.preventDefault();
  const amount = Math.round(Number(elements.settlementAmount.value));
  if (!elements.settlementDate.value || !Number.isFinite(amount) || amount <= 0) {
    alert("日付と1円以上の返済額を入力してください。");
    return;
  }

  const [fromPerson, toPerson] = elements.settlementDirection.value.split("|");
  const savedSettlement = {
    id: editingSettlementId || createId(),
    created_at: editingSettlementId
      ? settlements.find(item => item.id === editingSettlementId)?.created_at || new Date().toISOString()
      : new Date().toISOString(),
    date: elements.settlementDate.value,
    from_person: fromPerson,
    to_person: toPerson,
    amount
  };

  const nextSettlements = editingSettlementId === null
    ? [...settlements, savedSettlement]
    : settlements.map(item => item.id === editingSettlementId ? savedSettlement : item);
  if (!saveList(STORAGE_KEYS.settlements, nextSettlements)) return;
  settlements = nextSettlements;
  elements.monthPicker.value = savedSettlement.date.slice(0, 7);
  resetSettlementForm();
  render();
}

function editSettlement(id) {
  const settlement = settlements.find(item => item.id === id);
  if (!settlement) return;
  editingSettlementId = id;
  elements.settlementDate.value = settlement.date;
  elements.settlementDirection.value = `${settlement.from_person}|${settlement.to_person}`;
  elements.settlementAmount.value = settlement.amount;
  elements.settlementFormTitle.textContent = "精算を編集";
  elements.saveSettlementButton.textContent = "変更を保存";
  showSettlementForm();
}

function deleteSettlement(id) {
  const settlement = settlements.find(item => item.id === id);
  if (!settlement || !confirm(`「${settlement.from_person} → ${settlement.to_person} ${yen.format(settlement.amount)}」の精算を削除しますか？`)) return;
  const nextSettlements = settlements.filter(item => item.id !== id);
  if (!saveList(STORAGE_KEYS.settlements, nextSettlements)) return;
  settlements = nextSettlements;
  if (editingSettlementId === id) resetSettlementForm();
  render();
}

function changeMonth(offset) {
  const [year, month] = elements.monthPicker.value.split("-").map(Number);
  const target = new Date(year, month - 1 + offset, 1);
  elements.monthPicker.value = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
  render();
}

function renderSummary(monthExpenses, monthSettlements) {
  const total = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const myTotal = monthExpenses.filter(expense => expense.payer === "自分").reduce((sum, expense) => sum + expense.amount, 0);
  const partnerTotal = total - myTotal;
  const repaidTotal = monthSettlements.reduce((sum, settlement) => sum + settlement.amount, 0);
  const receivedByMe = monthSettlements.reduce((sum, settlement) => {
    return sum + (settlement.from_person === "相手" && settlement.to_person === "自分" ? settlement.amount : -settlement.amount);
  }, 0);
  const outstanding = (myTotal - partnerTotal) / 2 - receivedByMe;
  elements.total.textContent = yen.format(total);
  elements.myTotal.textContent = yen.format(myTotal);
  elements.partnerTotal.textContent = yen.format(partnerTotal);
  elements.repaidTotal.textContent = yen.format(repaidTotal);
  elements.expenseCount.textContent = `${monthExpenses.length + monthSettlements.length}件`;
  if (total === 0 && repaidTotal === 0) elements.settlementText.textContent = "支出・精算はまだありません";
  else if (Math.abs(outstanding) < 0.5) elements.settlementText.textContent = "精算済みです（¥0）";
  else if (outstanding > 0) elements.settlementText.textContent = `相手 → 自分へ ${yen.format(Math.abs(outstanding))}`;
  else elements.settlementText.textContent = `自分 → 相手へ ${yen.format(Math.abs(outstanding))}`;
}

function renderHistory(monthExpenses, monthSettlements) {
  elements.history.replaceChildren();
  const entries = [
    ...monthExpenses.map(item => ({ ...item, kind: "expense" })),
    ...monthSettlements.map(item => ({ ...item, kind: "settlement" }))
  ].sort((a, b) => b.date.localeCompare(a.date) || String(b.created_at || "").localeCompare(String(a.created_at || "")));

  if (!entries.length) {
    elements.history.append(emptyState("この月の支出・精算はまだありません"));
    return;
  }

  entries.forEach(entry => {
    const item = createElement("article", "history-item");
    const main = createElement("div", "history-main");
    const details = document.createElement("div");
    const title = createElement("div", "history-title");
    const type = createElement("span", `history-type${entry.kind === "settlement" ? " history-type-settlement" : ""}`, entry.kind === "expense" ? "支出" : "精算");
    title.append(type, document.createTextNode(entry.kind === "expense" ? entry.title : `${entry.from_person} → ${entry.to_person}`));
    const info = entry.kind === "expense"
      ? `${entry.date.replaceAll("-", "/")} ・ ${entry.payer}が支払い`
      : `${entry.date.replaceAll("-", "/")} ・ 返済`;
    details.append(title, createElement("div", "history-info", info));
    main.append(details, createElement("strong", "history-amount", yen.format(entry.amount)));
    const actions = createElement("div", "history-actions");
    const edit = createElement("button", "edit-button", "編集");
    edit.type = "button";
    edit.addEventListener("click", () => entry.kind === "expense" ? editExpense(entry.id) : editSettlement(entry.id));
    const remove = createElement("button", "delete-button", "削除");
    remove.type = "button";
    remove.addEventListener("click", () => {
      edit.disabled = true;
      remove.disabled = true;
      if (entry.kind === "expense") deleteExpense(entry.id);
      else deleteSettlement(entry.id);
      if (document.body.contains(remove)) {
        edit.disabled = false;
        remove.disabled = false;
        remove.textContent = "削除";
      }
    });
    actions.append(edit, remove);
    item.append(main, actions);
    elements.history.append(item);
  });
}

function render() {
  const monthExpenses = selectedExpenses();
  const monthSettlements = selectedSettlements();
  renderSummary(monthExpenses, monthSettlements);
  renderHistory(monthExpenses, monthSettlements);
}

function initialize() {
  elements.monthPicker.value = localDateString().slice(0, 7);
  resetForm();
  resetSettlementForm();
  expenses = loadList(STORAGE_KEYS.expenses, normalizeExpense);
  settlements = loadList(STORAGE_KEYS.settlements, normalizeSettlement);
  renderLastBackupAt();
  render();
}

elements.form.addEventListener("submit", submitExpense);
elements.cancelButton.addEventListener("click", resetForm);
elements.showSettlementButton.addEventListener("click", showSettlementForm);
elements.settlementForm.addEventListener("submit", submitSettlement);
elements.cancelSettlementButton.addEventListener("click", resetSettlementForm);
elements.monthPicker.addEventListener("change", render);
elements.previousMonth.addEventListener("click", () => changeMonth(-1));
elements.nextMonth.addEventListener("click", () => changeMonth(1));
elements.exportBackupButton.addEventListener("click", exportBackup);
elements.importBackupButton.addEventListener("click", () => elements.backupFileInput.click());
elements.backupFileInput.addEventListener("change", importBackupFile);

initialize();
