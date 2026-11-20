import {ResultPage} from '../result-page';
export const dynamic='force-dynamic';
export default function CheckoutSuccess({searchParams}:{searchParams:Promise<{orderId?:string}>}){return <ResultPage searchParams={searchParams} kind="success"/>}
