"use client";
import { CircleDot } from "lucide-react";
import { PanelHeader } from "./panel-header";
export function StatusPanel() { return <div className="flex min-h-0 flex-1 flex-col"><PanelHeader title="الحالة" showLogo={false}/><div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground"><CircleDot className="mb-3 h-10 w-10 opacity-50"/><p className="font-medium">الحالات غير مفعّلة في الخادم الحالي</p><p className="mt-2 text-sm">واجهة الحالات جاهزة بصرياً، لكن Railway لا يوفر API لحفظ الحالات بعد.</p></div></div>; }
