# Agentes IA - The Agency

Colección de agentes especializados para el proyecto multi_shop. Basado en [agency-agents](https://github.com/msitarzewski/agency-agents).

## Instalación

Los agentes ya están instalados en:
- `.opencode/agents/` (145 agentes disponibles)
- `~/.claude/agents/` (145 agentes para Claude Code)

---

## Agentes Relevantes para multi_shop

### Claude Code
```
"Hey Claude, activa [nombre del agente] y ayuda con [tarea]"
```

### 1. Frontend Developer
**Archivo:** `frontend-developer.md`

**Especialidad:** React, Next.js, TypeScript, UI implementation, performance optimization

**Cuándo usarlo:**
- Crear nuevos componentes React
- Implementar interfaces responsive
- Optimizar Core Web Vitals
- Crear component libraries

**Invocación:**
```
"Activa el agente Frontend Developer para crear este componente"
"Usa Frontend Developer para optimizar el rendimiento"
```

---

### 2. Backend Architect
**Archivo:** `backend-architect.md`

**Especialidad:** API design, database architecture, scalable systems, Supabase, microservices

**Cuándo usarlo:**
- Diseñar nuevas APIs
- Optimizar consultas de base de datos
- Arquitectura de servicios
- Seguridad y autenticación

**Invocación:**
```
"Activa Backend Architect para diseñar esta API"
"Usa Backend Architect para revisar la arquitectura"
```

---

### 3. UI Designer
**Archivo:** `ui-designer.md`

**Especialidad:** Design systems, component libraries, pixel-perfect interfaces, Tailwind CSS

**Cuándo usarlo:**
- Crear nuevos componentes UI
- Diseñar sistemas de diseño
- Mejorar consistencia visual
- Accesibilidad WCAG

**Invocación:**
```
"Activa UI Designer para crear este componente"
"Usa UI Designer para revisar el diseño"
```

---

### 4. Code Reviewer
**Archivo:** `code-reviewer.md`

**Especialidad:** Code review, security, maintainability, performance, testing

**Cuándo usarlo:**
- Revisar PRs y código
- Detectar vulnerabilidades
- Mejorar calidad del código
- Revisiones de seguridad

**Invocación:**
```
"Activa Code Reviewer para revisar este código"
"Usa Code Reviewer para hacer review de seguridad"
```

**Checklist de revisión:**
- 🔴 Blockers: Security vulnerabilities, correctness bugs
- 🟡 Suggestions: Performance improvements, maintainability
- 💭 Nits: Code style, naming conventions

---

### 5. SEO Specialist
**Archivo:** `seo-specialist.md`

**Especialidad:** Technical SEO, content optimization, Core Web Vitals, structured data

**Cuándo usarlo:**
- Optimizar para buscadores
- Auditorías técnicas SEO
- Mejorar rendimiento
- Structured data / Schema.org

**Invocación:**
```
"Activa SEO Specialist para auditar el sitio"
"Usa SEO Specialist para optimizar contenido"
```

**Requisitos técnicos:**
- LCP < 2.5s
- INP < 200ms
- CLS < 0.1

---

### 6. Growth Hacker
**Archivo:** `growth-hacker.md`

**Especialidad:** User acquisition, viral loops, A/B testing, conversion optimization

**Cuándo usarlo:**
- Estrategias de crecimiento
- Optimización de funnels
- Experimentos de adquisición
- Product-led growth

**Invocación:**
```
"Activa Growth Hacker para diseñar estrategia de crecimiento"
"Usa Growth Hacker para optimizar conversiones"
```

---

### 7. Product Manager
**Archivo:** `product-manager.md`

**Especialidad:** Product lifecycle, roadmaps, PRD, stakeholder alignment, metrics

**Cuándo usarlo:**
- Planificar nuevas funcionalidades
- Crear PRDs
- Priorizar roadmap
- Definir métricas de éxito

**Invocación:**
```
"Activa Product Manager para crear el PRD de esta feature"
"Usa Product Manager para priorizarel roadmap"
```

**Reglas clave:**
1. Lead with problem, not solution
2. Escribir press release antes del PRD
3. Métricas definidas antes de construir
4. "No" claro y respetuoso

---

## Uso General

### OpenCode
Para activar un agente, simplemente inclúyelo en tu prompt:
```
"Usa el agente [nombre] para [tarea]"
```

### Claude Code
```
"Hey Claude, activa [nombre del agente] y ayuda con [tarea]"
```

---

## Más Agentes Disponibles

Otros agentes útiles para multi_shop:

| Agente | Uso |
|--------|-----|
| `devops-automator` | CI/CD, deployment |
| `database-optimizer` | Query optimization |
| `technical-writer` | Documentación |
| `security-engineer` | Auditorías de seguridad |
| `mobile-app-builder` | Apps móviles |
| `analytics-reporter` | Métricas y dashboards |

---

## Notas

- Los agentes están configurados como `mode: subagent`
- Cada agente tiene sus propias reglas y deliverables
- Para mejor resultados, proporciona contexto específico al invocar
