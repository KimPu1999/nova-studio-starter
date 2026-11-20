import Link from 'next/link';

export default function NotFound(){return <main className="container-narrow page-pad"><p className="eyebrow">404</p><h1 className="page-title">Page not found.</h1><p className="page-description">The page you requested does not exist or is no longer published.</p><Link href="/" className="btn-primary mt-8 inline-flex">Back home</Link></main>}
