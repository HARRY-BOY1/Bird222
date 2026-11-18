"use client";
import { Phone } from "lucide-react";
import { PanelHeader } from "./panel-header";
export function CallHistoryPanel() { return <div className="flex min-h-0 flex-1 flex-col"><PanelHeader title="المكالمات" showLogo={false}/><div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground"><Phone className="mb-3 h-10 w-10 opacity-50"/><p className="font-medium">لا يوجد سجل مكالمات محفوظ</p><p className="mt-2 text-sm">الخادم يدعم إشارات WebRTC الفورية، لكن لا يوفر API لتاريخ المكالمات.</p></div></div>; }
