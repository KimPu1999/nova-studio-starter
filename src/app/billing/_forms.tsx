'use client';
import {useActionState} from 'react';
import {submitPaymentAction, requestRefundAction, updateBillingSettingsAction} from './actions';

type BillingFormState = {error?:string; success?:string};

const initial: BillingFormState = {};

export function PayInvoiceForm({invoiceId, outstanding, lang}:{invoiceId:string; outstanding:number; lang:'en'|'mm'}) {
  const [state, action, pending] = useActionState(submitPaymentAction, initial);
  const mm = lang === 'mm';
  return <form action={action} className="admin-form">
    <input type="hidden" name="invoiceId" value={invoiceId}/>
    <div className="grid gap-4 sm:grid-cols-2">
      <label>{mm?'ငွေပေးချေမှုနည်းလမ်း':'Payment method'}
        <select name="method" className="form-input" required defaultValue="KBZPAY">
          <option value="KBZPAY">KBZPay</option>
          <option value="WAVEPAY">WavePay</option>
          <option value="BANK_TRANSFER">{mm?'ဘဏ်လွှဲပြောင်း':'Bank transfer'}</option>
        </select>
      </label>
      <label>{mm?'ပမာဏ (ကျပ်)':'Amount (MMK)'}
        <input className="form-input" name="amountMmk" type="number" min={1} max={outstanding} defaultValue={outstanding} required/>
      </label>
    </div>
    <label>{mm?'လုပ်ငန်းစဉ်အညွှန်း':'Transaction reference'}
      <input className="form-input" name="transactionReference" required minLength={4} maxLength={100} placeholder={mm?'KBZPay/WavePay အညွှန်း':'e.g. KBZPay transaction ID'}/>
    </label>
    <label>{mm?'အထောက်အထား (PNG, JPEG, PDF)':'Receipt (PNG, JPEG, PDF)'}
      <input className="form-input" name="proof" type="file" accept="image/png,image/jpeg,application/pdf" required/>
      <small className="text-slate-500">{mm?'ဖန်တီးမှုပုံများသည် ငွေပေးချေမှုအထောက်အထားမဟုတ်ပါ — ငွေစာရင်းစိစစ်မှုသာ အတည်ပြုမည်။':'Screenshots are records for the reviewer only — verification happens against the actual wallet/bank record.'}</small>
    </label>
    {state.error?<p className="admin-error">{state.error}</p>:null}
    {state.success?<p className="billing-note">{state.success}</p>:null}
    <button className="btn-primary" type="submit" disabled={pending}>{pending?(mm?'တင်နေသည်…':'Submitting…'):(mm?'တင်ပြ':'Submit for verification')}</button>
  </form>;
}

export function RefundRequestForm({invoiceId, eligible, lang}:{invoiceId:string; eligible:number; lang:'en'|'mm'}) {
  const [state, action, pending] = useActionState(requestRefundAction, initial);
  const mm = lang === 'mm';
  return <form action={action} className="admin-form">
    <input type="hidden" name="invoiceId" value={invoiceId}/>
    <label>{mm?'ပမာဏ (ကျပ်)':'Amount (MMK)'}
      <input className="form-input" name="amountMmk" type="number" min={1} max={eligible} defaultValue={eligible}/>
    </label>
    <label>{mm?'အကြောင်းပြချက် (အနည်းဆုံး စာလုံး ၁၀)':'Reason (at least 10 characters)'}
      <textarea className="form-input" name="reason" rows={3} required minLength={10}/>
    </label>
    {state.error?<p className="admin-error">{state.error}</p>:null}
    {state.success?<p className="billing-note">{state.success}</p>:null}
    <button className="btn-outline" type="submit" disabled={pending}>{mm?'ငွေပြန်တောင်းခံ':'Request refund'}</button>
  </form>;
}

export function BillingSettingsForm({accountId, values, lang}:{accountId:string; values:{contactName:string|null; contactEmail:string|null; contactPhone:string|null; companyInfo:string|null; preferences:string}; lang:'en'|'mm'}) {
  const [state, action, pending] = useActionState(updateBillingSettingsAction, initial);
  const mm = lang === 'mm';
  return <form action={action} className="admin-form">
    <input type="hidden" name="accountId" value={accountId}/>
    <div className="grid gap-4 sm:grid-cols-2">
      <label>{mm?'ဆက်သွယ်ရန် အမည်':'Contact name'}<input className="form-input" name="contactName" defaultValue={values.contactName ?? ''}/></label>
      <label>{mm?'ဆက်သွယ်ရန် အီးမေးလ်':'Contact email'}<input className="form-input" name="contactEmail" type="email" defaultValue={values.contactEmail ?? ''}/></label>
      <label>{mm?'ဖုန်း':'Phone'}<input className="form-input" name="contactPhone" defaultValue={values.contactPhone ?? ''}/></label>
      <label>{mm?'ကုမ္ပဏီအချက်အလက် (ဆိုင်ရာကြေးငွေအတွက်)':'Company info (invoice details)'}<input className="form-input" name="companyInfo" defaultValue={values.companyInfo ?? ''}/></label>
    </div>
    <label>{mm?'ငွေစာရင်း ရွေးချယ်မှုများ (JSON)':'Billing preferences (JSON)'}<input className="form-input" name="preferences" defaultValue={values.preferences} placeholder='{"invoiceDelivery":"email"}'/></label>
    {state.error?<p className="admin-error">{state.error}</p>:null}
    {state.success?<p className="billing-note">{state.success}</p>:null}
    <button className="btn-primary" type="submit" disabled={pending}>{mm?'သိမ်းဆည်း':'Save'}</button>
  </form>;
}
