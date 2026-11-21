import {createFileRoute,Link} from '@tanstack/react-router';
import {PublicLayout} from '@/components/site/PublicLayout';
import {AccountSettings} from '@/components/dashboard/AccountSettings';
import {useEffect} from 'react';
import {useI18n} from '@/lib/i18n';
import '@/components/dashboard/studio.css';
export const Route=createFileRoute('/_authenticated/account')({head:()=>({meta:[{title:'Account settings | Dealmaker'},{name:'description',content:'Manage your Dealmaker sign-in details, account name and closure requests.'},{property:'og:title',content:'Account settings | Dealmaker'},{property:'og:description',content:'Your private Dealmaker account settings.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'},{name:'robots',content:'noindex'}]}),component:AccountPage});
function AccountPage(){const {t}=useI18n();useEffect(()=>{document.documentElement.classList.add('dm-dash');return ()=>document.documentElement.classList.remove('dm-dash');},[]);return <PublicLayout><main className="studio-account-page studio-reference"><Link to="/dashboard" className="inline-flex mb-6 text-sm text-gold">{t('Back to dashboard')}</Link><AccountSettings/></main></PublicLayout>;}
