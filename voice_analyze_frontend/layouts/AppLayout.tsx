import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { BarChart3, LayoutDashboard, Menu, Mic2, Radio, User } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store";
import { logout } from "../store/slices/authSlice";
import { LanguageSelector, useI18n } from "../i18n";

const AppLayout: React.FC = () => {
  const [open,setOpen]=useState(false); const dispatch=useDispatch(); const navigate=useNavigate(); const {t}=useI18n();
  const user=useSelector((s:RootState)=>s.auth.user); const role=user?.role;
  const items=[{to:"/training",label:t("training"),icon:Mic2},{to:"/recording",label:t("recording"),icon:Radio},...(role==="student"?[{to:"/progress",label:t("progress"),icon:BarChart3}]:[]),...(role==="qari"?[{to:"/dashboard",label:t("dashboard"),icon:LayoutDashboard}]:[]),...(["student","qari"].includes(role||"")?[{to:"/profile",label:t("profile"),icon:User}]:[])];
  const side=<><div className="flex items-center gap-3 border-b border-slate-800 p-5 font-bold"><img src="/images/logo-web.jpg" width="44" height="44" alt="Tarannum.ai logo" className="h-11 w-11 rounded-full object-cover"/><span>Tarannum.ai</span></div><nav className="flex-1 space-y-2 p-3">{items.map(({to,label,icon:Icon})=><NavLink key={to} to={to} onClick={()=>setOpen(false)} className={({isActive})=>`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${isActive?"bg-emerald-600 text-white":"text-slate-300 hover:bg-slate-800"}`}><Icon size={19}/>{label}</NavLink>)}</nav><div className="border-t border-slate-800 p-4"><div className="mb-3 truncate text-sm text-slate-300">{user?.full_name||user?.email}</div><button className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300" onClick={()=>{dispatch(logout());navigate("/")}}>{t("logout")}</button></div></>;
  return <div className="min-h-screen bg-slate-50"><aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-slate-950 text-white md:flex">{side}</aside>{open&&<><div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={()=>setOpen(false)}/><aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-slate-950 text-white md:hidden">{side}</aside></>}<header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-white px-4 md:ml-64"><div className="flex items-center gap-3"><button onClick={()=>setOpen(true)} className="p-2 md:hidden"><Menu/></button><span className="font-bold">Tarannum AI</span></div><LanguageSelector/></header><main className="md:ml-64"><Outlet/></main></div>;
};
export default AppLayout;
