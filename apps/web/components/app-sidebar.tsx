"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Crosshair, Home, Library, ScanSearch, Tv } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const GLOBAL = [
  { label: "工作台", href: "/", icon: Home, end: true },
  { label: "Clerk", href: "/clerk", icon: ScanSearch },
  { label: "SOP 库", href: "/sops", icon: Library },
  { label: "对标账号池", href: "/competitors", icon: Crosshair },
];

const ACCOUNTS = [{ label: "账号", href: "/accounts", icon: Tv }];

export function AppSidebar() {
  const pathname = usePathname();

  const isActive = (href: string, end?: boolean) =>
    end ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Sidebar>
      <SidebarHeader className="px-6 pt-10 pb-6">
        <Link href="/" className="font-display text-3xl italic leading-none">
          Singularity
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>全局</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {GLOBAL.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={isActive(item.href, item.end)}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>我的账号</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ACCOUNTS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={isActive(item.href)}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
