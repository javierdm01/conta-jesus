import { redirect } from "next/navigation";
import { currentUser,AppError } from "@/lib/access";
import { getState } from "@/lib/state";
import { Dashboard } from "@/components/dashboard";
import type { State } from "@/lib/workspace-types";
export const dynamic="force-dynamic";
export default async function WorkspaceLayout({children}:{children:React.ReactNode}){
  let user;try{user=await currentUser()}catch(e){if(e instanceof AppError&&e.status===401)redirect("/login");throw e}
  const initialState=JSON.parse(JSON.stringify(await getState(user))) as State;
  return <Dashboard initialState={initialState}>{children}</Dashboard>;
}
