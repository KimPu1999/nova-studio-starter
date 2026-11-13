/**
 * Phase 18 — billing UI localization (EN / MM) and display helpers.
 *
 * Stored data is UTC integer-MMK; Asia/Yangon (+06:30) is display-only.
 * The language is a per-user cookie set from the billing sidebar toggle.
 */
import { cookies } from 'next/headers';

export type BillingLang = 'en' | 'mm';

export const BILLING_LANG_COOKIE = 'billing_lang';

const LABELS: Record<string, { en: string; mm: string }> = {
  overview: { en: 'Overview', mm: 'ခြုံငံချုပ်' },
  plans: { en: 'Plans', mm: 'အစီအစဉ်များ' },
  subscription: { en: 'Subscription', mm: 'စာရင်းသွင်းမှု' },
  invoices: { en: 'Invoices', mm: 'ဆိုင်ရာကြေးငွေစာရင်း' },
  payments: { en: 'Payments', mm: 'ငွေပေးချေမှုများ' },
  usage: { en: 'Usage', mm: 'အသုံးပြုမှု' },
  credits: { en: 'AI Credits', mm: 'AI ကရেဒစ်' },
  settings: { en: 'Settings', mm: 'ဆက်တင်များ' },
  currentPlan: { en: 'Current plan', mm: 'လက်ရှိအစီအစဉ်' },
  outstanding: { en: 'Outstanding balance', mm: 'ကျန်ရှိသောငွေ' },
  creditBalance: { en: 'AI credit balance', mm: 'AI ကရေဒစ်လက်ကျန်' },
  renewsAt: { en: 'Renews on', mm: 'ပြန်လည်သက်တမ်းတိုးမည့်ရက်' },
  dueOn: { en: 'Due on', mm: 'ပေးဆပ်ရမည့်ရက်' },
  status: { en: 'Status', mm: 'အခြေအနေ' },
  amount: { en: 'Amount', mm: 'ပမာဏ' },
  submitPayment: { en: 'Submit payment for verification', mm: 'ငွေပေးချေမှုတင်ပြရန်' },
  pendingReview: { en: 'Pending verification', mm: 'စိစစ်ဆဲ' },
  verified: { en: 'Verified', mm: 'စိစစ်ပြီး' },
  rejected: { en: 'Rejected', mm: 'ငြင်းပယ်ခြင်း' },
  cancelled: { en: 'Cancelled', mm: 'ပယ်ဖျက်ခြင်း' },
  method: { en: 'Method', mm: 'နည်းလမ်း' },
  reference: { en: 'Transaction reference', mm: 'လုပ်ငန်းစဉ်အညွှန်း' },
  proof: { en: 'Payment proof (record only)', mm: 'ငွေပေးချေမှုအထောက်အထား (မှတ်တမ်းသာ)' },
  note: { en: 'Note', mm: 'မှတ်ချက်' },
  date: { en: 'Date', mm: 'ရက်စွဲ' },
  total: { en: 'Total', mm: 'စုစုပေါင်း' },
  paid: { en: 'Paid', mm: 'ပေးချေပြီး' },
  action: { en: 'Action', mm: 'လုပ်ဆောင်ချက်' },
  monthly: { en: 'Monthly', mm: 'လစဉ်' },
  annual: { en: 'Annual', mm: 'နှစ်စဉ်' },
  choosePlan: { en: 'Choose this plan', mm: 'ဤအစီအစဉ်ကိုရွေးပါ' },
  requestRefund: { en: 'Request refund', mm: 'ငွေပြန်တောင်းခံရန်' },
  cancelSubscription: { en: 'Cancel subscription', mm: 'စာရင်းသွင်းမှုပယ်ဖျက်' },
  cancelAtPeriodEnd: { en: 'Cancel at period end', mm: 'အသတ်မှတ်တွင်ပယ်ဖျက်' },
  billingDetails: { en: 'Billing details', mm: 'ငွေစာရင်းအချက်အလက်' },
  save: { en: 'Save', mm: 'သိမ်းဆည်း' },
  upgrade: { en: 'Upgrade', mm: 'တိုးမြှင့်' },
  included: { en: 'Included', mm: 'ထည့်ပေးထားသည်' },
  unlimited: { en: 'Unlimited', mm: 'ကန့်သတ်ချက်မရှိ' },
};

export function getBillingLang(): Promise<BillingLang> {
  return cookies().then((c) => (c.get(BILLING_LANG_COOKIE)?.value === 'mm' ? 'mm' : 'en'));
}

/** Translates a label in the active language. Unknown keys fall back to the key. */
export async function t(key: string): Promise<string> {
  const lang = await getBillingLang();
  return LABELS[key]?.[lang] ?? key;
}

const MM_DIGITS = ['၀', '၁', '၂', '၃', '၄', '၅', '၆', '၇', '၈', '၉'];

/** 12,345 -> "၁၂,၃၄၅" for Burmese display. */
export function toMmDigits(value: string): string {
  return value.replace(/\d/g, (d) => MM_DIGITS[Number(d)]);
}

export function formatMmk(amountMmk: number, lang: BillingLang = 'en'): string {
  const formatted = amountMmk.toLocaleString('en-US') + ' MMK';
  return lang === 'mm' ? toMmDigits(formatted).replace(/MMK/g, 'ကျပ်') : formatted;
}

/** Displays an instant in Asia/Yangon time with the UTC instant preserved for precision. */
export function formatDateTime(date: Date | null | undefined, lang: BillingLang = 'en'): string {
  if (!date) return '—';
  const yangoon = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Yangon', dateStyle: 'medium', timeStyle: 'short' }).format(date);
  return lang === 'mm' ? toMmDigits(yangoon) : `${yangoon} MM(+06:30)`;
}

export function formatDate(date: Date | null | undefined, lang: BillingLang = 'en'): string {
  if (!date) return '—';
  const yangoon = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Yangon', dateStyle: 'medium' }).format(date);
  return lang === 'mm' ? toMmDigits(yangoon) : yangoon;
}

export function formatNumber(n: number | null | undefined, lang: BillingLang = 'en'): string {
  if (n === null || n === undefined) return '—';
  const formatted = n.toLocaleString('en-US');
  return lang === 'mm' ? toMmDigits(formatted) : formatted;
}
