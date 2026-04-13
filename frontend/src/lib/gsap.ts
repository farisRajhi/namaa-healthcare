import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin, useGSAP)

gsap.defaults({
  duration: 0.6,
  ease: 'power2.out',
})

export { gsap, ScrollTrigger, useGSAP }
