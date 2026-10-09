import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing.js'

/** Link and router that keep the current language without being told. */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)
