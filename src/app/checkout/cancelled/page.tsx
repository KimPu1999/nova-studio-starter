import {ResultPage} from '../result-page';
export const dynamic='force-dynamic';
export default function CheckoutCancelled({searchParams}:{searchParams:Promise<{orderId?:string}>}){return <ResultPage searchParams={searchParams} kind="cancelled"/>}
