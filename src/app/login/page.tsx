import LoginForm from './login-form';

export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string}>}){
  const params=await searchParams;
  const next=typeof params.next==='string'&&params.next.startsWith('/')&&!params.next.startsWith('//')?params.next:'/account';
  return <LoginForm next={next}/>;
}
