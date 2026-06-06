#!/usr/bin/env bash
# 按 package.json 版本号创建 annotated tag 并推送到 origin
# 用法:
#   bash scripts/release-tag.sh              # 创建 tag 并推送
#   bash scripts/release-tag.sh --no-push    # 仅本地创建 tag
#   bash scripts/release-tag.sh --dry-run    # 预览，不写入
#   bash scripts/release-tag.sh --message "自定义说明"
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

PUSH=true
DRY_RUN=false
CUSTOM_MESSAGE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --push) PUSH=true; shift ;;
    --no-push) PUSH=false; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --message)
      CUSTOM_MESSAGE="${2:-}"
      if [[ -z "$CUSTOM_MESSAGE" ]]; then
        echo "错误: --message 需要非空内容" >&2
        exit 1
      fi
      shift 2
      ;;
    -h|--help)
      sed -n '2,7p' "$0" | sed 's/^# //'
      exit 0
      ;;
    *)
      echo "未知参数: $1（可用 --help 查看用法）" >&2
      exit 1
      ;;
  esac
done

RED='\033[0;31m'
YEL='\033[0;33m'
GRN='\033[0;32m'
NC='\033[0m'

info() { echo -e "${GRN}>>${NC} $1"; }
warn() { echo -e "${YEL}WARN${NC} $1"; }
fail() { echo -e "${RED}FAIL${NC} $1" >&2; exit 1; }

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  fail "当前目录不是 git 仓库"
fi

if [[ ! -f package.json ]]; then
  fail "未找到根目录 package.json"
fi

VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"

if [[ -z "$VERSION" ]]; then
  fail "无法从 package.json 读取 version"
fi

PREV_TAG="$(git tag -l 'v*' --sort=-v:refname | head -1 || true)"
if [[ -n "$PREV_TAG" ]]; then
  PREV_VERSION="${PREV_TAG#v}"
  HIGHER="$(printf '%s\n' "$VERSION" "$PREV_VERSION" | sort -V | tail -1)"
  if [[ "$HIGHER" == "$PREV_VERSION" ]]; then
    if [[ "$VERSION" == "$PREV_VERSION" ]]; then
      fail "版本 ${VERSION} 与最新 tag ${PREV_TAG} 相同，请先 bump package.json"
    else
      fail "版本 ${VERSION} 低于最新 tag ${PREV_TAG}，请先 bump package.json"
    fi
  fi
fi

if git rev-parse "$TAG" >/dev/null 2>&1; then
  fail "本地已存在 tag: $TAG"
fi

if git ls-remote --tags origin "refs/tags/${TAG}" 2>/dev/null | grep -q .; then
  fail "远程 origin 已存在 tag: $TAG"
fi

if [[ -n "$(git status --porcelain)" ]]; then
  warn "工作区有未提交改动，tag 将指向当前 HEAD"
fi

COMMIT="$(git rev-parse --short HEAD)"

if [[ -n "$CUSTOM_MESSAGE" ]]; then
  TAG_MESSAGE="$CUSTOM_MESSAGE"
else
  TAG_MESSAGE="${TAG}"
  if [[ -n "$PREV_TAG" ]]; then
    LOG="$(git log "${PREV_TAG}..HEAD" --pretty=format:'- %s' --no-merges 2>/dev/null || true)"
    if [[ -n "$LOG" ]]; then
      TAG_MESSAGE="${TAG}

${LOG}"
    fi
  fi
fi

echo
info "版本: ${VERSION}"
info "Tag:  ${TAG}"
info "提交: ${COMMIT}"
if [[ -n "$PREV_TAG" ]]; then
  info "上个 tag: ${PREV_TAG}"
else
  info "上个 tag: （无）"
fi
echo
echo "Tag 说明:"
echo "$TAG_MESSAGE"
echo

if [[ "$DRY_RUN" == true ]]; then
  info "dry-run 模式，未创建 tag"
  exit 0
fi

git tag -a "$TAG" -m "$TAG_MESSAGE"
info "已创建 annotated tag: $TAG"

if [[ "$PUSH" == true ]]; then
  git push origin "$TAG"
  info "已推送到 origin: $TAG"
else
  warn "跳过推送。如需推送: git push origin $TAG"
fi
