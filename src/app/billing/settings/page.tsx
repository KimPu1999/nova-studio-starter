import {prisma} from '@/lib/prisma';
import {requireUser} from '@/lib/auth';
import {listBillingAccountsForUser} from '@/lib/billing/accounts';
import {getBillingLang} from '@/lib/billing/i18n';
import {BillingSettingsForm} from '../_forms';
export const dynamic='force-dynamic';
export default async function BillingSettings(){
  const user=await requireUser();
  const lang=await getBillingLang();
  const mm=lang==='mm';
  const accounts=await listBillingAccountsForUser(user);
  return <main className="admin-content">
    <p className="eyebrow">{mm?'ဆက်တင်များ':'SETTINGS'}</p>
    <h1 className="admin-title">{mm?'ငွေစာရင်းဆက်တင်များ':'Billing settings'}</h1>
    {accounts.length?accounts.map(account=><div className="admin-panel mt-8" key={account.id}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{account.name}</h2>
        <span className="status-badge status-draft">{account.type}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">{account.type==='ORGANIZATION'?(mm?'အဖွဲ့အစည်းငွေစာရင်း — workspace များမှတဆင့် အသုံးပြု':'Organization billing account (used by its workspaces)'):(mm?'ကိုယ်ပိုင်ငွေစာရင်း':'Personal billing account')} · {account.currency}</p>
      <BillingSettingsForm accountId={account.id} lang={lang} values={{contactName:account.contactName,contactEmail:account.contactEmail,contactPhone:account.contactPhone,companyInfo:account.companyInfo,preferences:account.preferences?JSON.stringify(account.preferences):''}}/>
    </div>):<div className="admin-panel admin-empty mt-8">{mm?'အကောင့်မရှိပါ။':'No billing accounts.'}</div>}
  </main>;
}
