import type {Metadata} from 'next';import './globals.css';import {Header} from '@/components/header';import {Footer} from '@/components/footer';
export const metadata:Metadata={title:{default:'NOVA Studio | Digital Templates & Custom Websites',template:'%s | NOVA Studio'},description:'Explore premium website templates and custom web development services.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><Header/>{children}<Footer/></body></html>}
