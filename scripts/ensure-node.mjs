import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const cwd = process.cwd()
const nvmrcPath = resolve(cwd, ".nvmrc")
const required = existsSync(nvmrcPath)
  ? readFileSync(nvmrcPath, "utf8").trim()
  : "22.12.0"

function parse(version) {
  const clean = version.trim().replace(/^v/, "")
  const [major = "0", minor = "0", patch = "0"] = clean.split(".")
  return [Number(major), Number(minor), Number(patch)]
}

function compare(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return 1
    if (a[i] < b[i]) return -1
  }
  return 0
}

const current = parse(process.version)
const target = parse(required)

if (compare(current, target) < 0) {
  console.error("")
  console.error(`Node ${required}+ is required for this repo.`)
  console.error(`Current runtime: ${process.version}`)
  console.error("")
  console.error("Fix:")
  console.error(`  nvm use ${required}`)
  console.error("  npm run dev")
  console.error("")
  console.error("If you do not have that version yet:")
  console.error(`  nvm install ${required}`)
  console.error("")
  process.exit(1)
}
