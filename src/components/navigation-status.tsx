"use client";
import {useLinkStatus} from "next/link";
export function NavigationStatus(){const {pending}=useLinkStatus();return pending?<span role="status" aria-label="Abriendo sección" className="navigation-pending"/>:null;}
