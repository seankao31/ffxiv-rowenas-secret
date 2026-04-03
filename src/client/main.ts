import './app.css'
import { mount } from 'svelte'
import AppShell from './components/AppShell.svelte'

mount(AppShell, { target: document.getElementById('app')! })
