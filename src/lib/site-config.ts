import {unstable_cache,revalidateTag} from 'next/cache';
import {databaseConfigured,prisma} from './prisma';
export const defaultSiteSettings={websiteName:'NOVA Studio',tagline:'Thoughtful digital experiences.',description:'Explore premium website templates and custom web development services.',contactEmail:'hello@nova.studio',businessPhone:'',businessAddress:'',defaultLanguage:'en',currency:'MMK',timezone:'Asia/Yangon',copyrightText:'© NOVA Studio. All rights reserved.',supportInformation:'',publicWebsiteUrl:'http://localhost:3000'};
const defaultAppearance={mode:'DARK',backgroundColor:'#09090F',surfaceColor:'#171725',primaryColor:'#8B5CF6',accentColor:'#22D3EE',textColor:'#F8FAFC',headingFont:'Inter',bodyFont:'Inter',reduceMotion:false};
const defaultBrand={brandName:'NOVA Studio',brandDescription:'Thoughtful templates and custom digital experiences.'};
const cachedSiteSettings=unstable_cache(async()=>{try{const rows=await prisma.siteSetting.findMany({select:{key:true,value:true}});return rows.reduce((acc,row)=>({...acc,[row.key]:row.value}),{...defaultSiteSettings});}catch{return defaultSiteSettings;}},['nova-site-settings'],{revalidate:60,tags:['nova-site-settings']});
const cachedAppearance=unstable_cache(async()=>{try{return (await prisma.appearanceSetting.findUnique({where:{singletonKey:'default'}}))??defaultAppearance;}catch{return defaultAppearance;}},['nova-appearance'],{revalidate:60,tags:['nova-appearance']});
const cachedBrand=unstable_cache(async()=>{try{return (await prisma.brandSetting.findUnique({where:{singletonKey:'default'}}))??defaultBrand;}catch{return defaultBrand;}},['nova-brand'],{revalidate:60,tags:['nova-brand']});
export async function getSiteSettings(){if(!databaseConfigured)return defaultSiteSettings;return cachedSiteSettings();}
export async function getAppearance(){if(!databaseConfigured)return defaultAppearance;return cachedAppearance();}
export async function getBrand(){if(!databaseConfigured)return defaultBrand;return cachedBrand();}
export function invalidateSiteConfigCache(){revalidateTag('nova-site-settings');revalidateTag('nova-appearance');revalidateTag('nova-brand');}
