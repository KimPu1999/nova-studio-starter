export default function AdminLoading(){
  return <main className="admin-content admin-loading" aria-label="Loading admin page"><div className="admin-loading-heading"><span/><span/></div><div className="admin-loading-grid">{Array.from({length:6},(_,index)=><div className="admin-loading-card" key={index}/>)}</div><div className="admin-loading-columns"><div className="admin-loading-panel"/><div className="admin-loading-panel"/></div></main>;
}
