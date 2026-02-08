#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Check available ports"""

import socket
import sys

# Set UTF-8 encoding for console
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

def is_port_available(port):
    """Check if a port is available"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        result = sock.connect_ex(('127.0.0.1', port))
        sock.close()
        return result != 0
    except:
        return False

# Check ports for backend (around 3000)
print("Checking ports for Backend API (3000-3020):")
backend_ports = []
for port in range(3000, 3021):
    if is_port_available(port):
        backend_ports.append(port)
        if len(backend_ports) <= 5:
            print(f"  [OK] Port {port} is AVAILABLE")
    elif port in [3000, 3005]:
        print(f"  [X] Port {port} is IN USE (current config)")

# Check ports for frontend (around 5173)
print("\nChecking ports for Frontend (5170-5180):")
frontend_ports = []
for port in range(5170, 5181):
    if is_port_available(port):
        frontend_ports.append(port)
        if len(frontend_ports) <= 5:
            print(f"  [OK] Port {port} is AVAILABLE")

print(f"\n=== RECOMMENDATIONS ===")
if backend_ports:
    print(f"Backend API: Use port {backend_ports[0]}")
else:
    print("Backend API: No available ports found in range")

if frontend_ports:
    print(f"Frontend: Use port {frontend_ports[0]}")
else:
    print("Frontend: No available ports found in range")
