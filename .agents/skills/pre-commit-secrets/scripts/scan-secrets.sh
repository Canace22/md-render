#!/usr/bin/env bash
# 提交前敏感信息扫描（md-render 项目）
# 用法: bash .agents/skills/pre-commit-secrets/scripts/scan-secrets.sh [--staged|--all]
set -euo pipefail

MODE="${1:---staged}"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

RED='\033[0;31m'
YEL='\033[0;33m'
GRN='\033[0;32m'
NC='\033[0m'

issues=0
warns=0

section() { echo; echo "== $1 =="; }

fail() { echo -e "${RED}FAIL${NC} $1"; issues=$((issues + 1)); }
warn() { echo -e "${YEL}WARN${NC} $1"; warns=$((warns + 1)); }
ok()   { echo -e "${GRN}OK${NC}   $1"; }

# 获取待扫描文件列表
get_files() {
  case "$MODE" in
    --staged)
      git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true
      ;;
    --all)
      git ls-files
      ;;
    --working)
      {
        git diff --name-only --diff-filter=ACMR 2>/dev/null || true
        git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true
        git ls-files --others --exclude-standard 2>/dev/null || true
      } | sort -u
      ;;
    *)
      echo "Unknown mode: $MODE (use --staged, --working, or --all)" >&2
      exit 2
      ;;
  esac
}

SKIP_PATHS='node_modules|dist/|dist-electron/|release/|build/|test-results/|pnpm-lock\.yaml'

filter_files() {
  grep -Ev "$SKIP_PATHS" || true
}

FILES="$(get_files | filter_files)"

section "1. 禁止提交的文件类型"
FORBIDDEN='\.(env|env\.local|env\.production|pem|key|p12|pfx|crt|credentials|secrets)$|(^|/)\.env'
if [ -n "$FILES" ]; then
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if echo "$f" | grep -Eq "$FORBIDDEN"; then
      fail "敏感文件在变更列表中: $f"
    fi
  done <<< "$FILES"
fi
if [ "$issues" -eq 0 ]; then ok "未发现 .env / 证书 / credentials 类文件"; fi

section "2. 高置信度密钥模式"
PATTERNS=(
  'secret_[a-zA-Z0-9]{20,}'
  'ntn_[a-zA-Z0-9]{20,}'
  'ghp_[a-zA-Z0-9]{36}'
  'github_pat_[a-zA-Z0-9_]{20,}'
  'sk-[a-zA-Z0-9]{20,}'
  'AKIA[0-9A-Z]{16}'
  'xox[baprs]-[a-zA-Z0-9-]{10,}'
  '-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----'
  'mongodb(\+srv)?://[^:]+:[^@]+@'
  'postgres(ql)?://[^:]+:[^@]+@'
  'mysql://[^:]+:[^@]+@'
)

scan_content() {
  local scope="$1"
  local content=""
  if [ "$scope" = "staged" ]; then
    content="$(
      git diff --cached -U0 -- . ":(exclude)pnpm-lock.yaml" ":(exclude)dist/**" ":(exclude)dist-electron/**" ":(exclude)node_modules/**" 2>/dev/null \
        | grep -E "$(IFS='|'; echo "${PATTERNS[*]}")" \
        || true
    )"
  else
    content="$(git grep -n -E "$(IFS='|'; echo "${PATTERNS[*]}")" -- . ":(exclude)pnpm-lock.yaml" ":(exclude)dist/**" ":(exclude)dist-electron/**" ":(exclude)node_modules/**" ":(exclude).agents/skills/pre-commit-secrets/**" 2>/dev/null || true)"
  fi
  if [ -n "$content" ]; then
    echo "$content" | while IFS= read -r line; do
      [ -z "$line" ] && continue
      fail "疑似密钥: $line"
    done
  else
    ok "未发现高置信度密钥模式"
  fi
}

if [ "$MODE" = "--staged" ]; then
  scan_content staged
else
  scan_content all
fi

section "3. 可疑赋值（需人工确认）"
SUSPICIOUS='(api[_-]?key|secret|password|token|credential)\s*[:=]\s*["'\''`][^"'\'']{8,}["'\''`]'
if [ -n "$FILES" ]; then
  hits=""
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ ! -f "$f" ] && continue
    case "$f" in
      *.js|*.jsx|*.json|*.yml|*.yaml|*.md|*.env*|*.sh) ;;
      *) continue ;;
    esac
    line="$(grep -nEi "$SUSPICIOUS" "$f" 2>/dev/null | grep -Ev 'placeholder|secret_…|type=.password|NOTION_TOKEN_STORAGE_KEY|parseInline|renderToken|withMeta|design-tokens|js-tokens|comma-separated-tokens|space-separated-tokens|micromark-util-subtokenize|id-token: write' || true)"
    if [ -n "$line" ]; then
      hits="${hits}${f}:\n${line}\n"
    fi
  done <<< "$FILES"
  if [ -n "$hits" ]; then
    echo -e "$hits" | while IFS= read -r line; do
      [ -z "$line" ] && continue
      warn "可疑赋值: $line"
    done
  else
    ok "未发现可疑硬编码赋值"
  fi
else
  ok "无待扫描文件"
fi

section "4. 项目特有风险（md-render）"
# Notion token 只应存在 localStorage，不应进源码
if git grep -n 'md-renderer-notion-token' -- . ':!.agents/skills/pre-commit-secrets/**' 2>/dev/null | grep -Ev 'STORAGE_KEY|localStorage\.(get|set)Item' >/dev/null 2>&1; then
  warn "Notion token 存储 key 出现在非预期位置"
else
  ok "Notion token 未硬编码进源码"
fi

# dist-electron 不应被 track
tracked_build="$(git ls-files dist-electron/ release/ build/ 2>/dev/null || true)"
if [ -n "$tracked_build" ]; then
  fail "构建产物被 git 跟踪:\n$tracked_build"
else
  ok "dist-electron / release / build 未被跟踪"
fi

section "汇总"
if [ "$issues" -gt 0 ]; then
  echo -e "${RED}发现 $issues 个必须处理的问题${NC}（警告 $warns 个）"
  exit 1
elif [ "$warns" -gt 0 ]; then
  echo -e "${YEL}无阻断问题，但有 $warns 个警告需人工确认${NC}"
  exit 0
else
  echo -e "${GRN}扫描通过，未发现敏感信息${NC}"
  exit 0
fi
