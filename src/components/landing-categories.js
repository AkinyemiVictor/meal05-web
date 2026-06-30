"use client";
import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";
import useCategories from "@/lib/use-categories";
import { categories as fallbackCategories } from "@/data/categories";
import styles from "@/app/landing.module.css";
const tones=["orange","blue","green","pink","amber","purple","red","yellow"];
export default function LandingCategories(){const{categories,status}=useCategories();const rows=(categories.length?categories:fallbackCategories).slice(0,8);return <><div className={styles.sectionHead}><div><span>Shop by category</span><h2>Everything for the kitchen</h2></div><Link href="/shop">Browse all categories <IconArrowRight/></Link></div><div className={styles.categories} aria-busy={status==="loading"}>{rows.map((category,index)=>{const name=category.label||category.name;const count=Number(category.product_count??category.available_product_count??category.count??0);return <Link href={`/categories/${category.slug}`} key={category.id||category.slug}><i className={styles[tones[index%tones.length]]}><i className={`fa-solid ${category.icon||"fa-basket-shopping"}`} aria-hidden="true"/></i><span><b>{name}</b><small>{count?`${count} items`:"Explore aisle"}</small></span></Link>})}</div></>}
