import type {Metadata} from 'next';
import './globals.css';
import './layout-fixes.css';
import {Header} from '@/components/header';
import {Footer} from '@/components/footer';
import {getAppearance,getBrand,getSiteSettings} from '@/lib/site-config';
export const metadata:Metadata={title:{default:'NOVA Studio | Digital Templates & Custom Websites',template:'%s | NOVA Studio'},description:'Explore premium website templates and custom web development services.'};
export default async function RootLayout({children}:{children:React.ReactNode}){const [settings,appearance,brand]=await Promise.all([getSiteSettings(),getAppearance(),getBrand()]);const css={'--nova-bg':appearance?.backgroundColor||'#09090F','--nova-surface':appearance?.surfaceColor||'#171725','--nova-primary':appearance?.primaryColor||'#8B5CF6','--nova-accent':appearance?.accentColor||'#22D3EE','--nova-text':appearance?.textColor||'#F8FAFC'} as React.CSSProperties;return <html lang={settings.defaultLanguage||'en'}><body style={css}><Header brandName={brand?.brandName||settings.websiteName}/>{children}<Footer brandName={brand?.brandName||settings.websiteName} copyright={settings.copyrightText}/></body></html>}
