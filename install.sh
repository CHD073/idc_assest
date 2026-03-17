#!/bin/bash

# ============================================================================
# IDC设备管理系统 - Linux 安装引导脚本
# ============================================================================
# 
# 功能：检测并安装 Node.js，然后运行 install.js
# 
# 使用方法：
#   方式1 - 直接运行：
#     chmod +x install.sh && ./install.sh
#   
#   方式2 - 一键安装（推荐）：
#     curl -fsSL https://your-domain/install.sh | bash
#   
#   方式3 - 从 GitHub：
#     curl -fsSL https://raw.githubusercontent.com/xxx/xxx/main/install.sh | bash
#
# ============================================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BRIGHT='\033[1m'
RESET='\033[0m'

# 日志函数
log_info() { echo -e "${CYAN}ℹ${RESET} $1"; }
log_success() { echo -e "${GREEN}✓${RESET} $1"; }
log_warning() { echo -e "${YELLOW}⚠${RESET} $1"; }
log_error() { echo -e "${RED}✗${RESET} $1"; }
log_step() { echo -e "\n${BRIGHT}${CYAN}▶ $1${RESET}"; }
log_divider() { echo -e "${YELLOW}$(printf '─%.0s' {1..60})${RESET}"; }

# 脚本版本
SCRIPT_VERSION="1.0.0"
MIN_NODE_VERSION=16

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 显示欢迎信息
show_banner() {
    echo -e "
${BRIGHT}${CYAN}
╔══════════════════════════════════════════════════════════╗
║     IDC设备管理系统 - Linux 安装引导脚本 v${SCRIPT_VERSION}          ║
║     Linux Bootstrap Installation Script                  ║
╚══════════════════════════════════════════════════════════╝
${RESET}"
}

# 检测 Linux 发行版
detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        echo "$ID"
    elif [ -f /etc/redhat-release ]; then
        echo "rhel"
    else
        echo "unknown"
    fi
}

# 检查是否为 root 用户
is_root() {
    [ "$(id -u)" -eq 0 ]
}

# 获取 sudo 前缀
get_sudo() {
    if is_root; then
        echo ""
    else
        echo "sudo"
    fi
}

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 获取 Node.js 版本号
get_node_version() {
    if command_exists node; then
        node -e "console.log(process.versions.node.split('.')[0])"
    else
        echo "0"
    fi
}

# 检查 Node.js 版本
check_node_version() {
    local version=$(get_node_version)
    [ "$version" -ge "$MIN_NODE_VERSION" ]
}

# 安装 Node.js - Ubuntu/Debian
install_node_debian() {
    local sudo=$(get_sudo)
    log_info "使用 NodeSource 安装 Node.js 20.x..."
    
    # 安装 curl（如果没有）
    if ! command_exists curl; then
        log_info "安装 curl..."
        $sudo apt-get update -qq
        $sudo apt-get install -y -qq curl
    fi
    
    # 添加 NodeSource 源
    log_info "添加 NodeSource 源..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | $sudo -E bash -
    
    # 安装 Node.js
    log_info "安装 Node.js..."
    $sudo apt-get install -y -qq nodejs
    
    # 验证安装
    if command_exists node; then
        log_success "Node.js $(node -v) 安装成功"
        return 0
    else
        return 1
    fi
}

# 安装 Node.js - CentOS/RHEL/Fedora
install_node_rhel() {
    local sudo=$(get_sudo)
    log_info "使用 NodeSource 安装 Node.js 20.x..."
    
    # 安装 curl（如果没有）
    if ! command_exists curl; then
        log_info "安装 curl..."
        $sudo yum install -y -q curl
    fi
    
    # 添加 NodeSource 源
    log_info "添加 NodeSource 源..."
    curl -fsSL https://rpm.nodesource.com/setup_20.x | $sudo bash -
    
    # 安装 Node.js
    log_info "安装 Node.js..."
    $sudo yum install -y -q nodejs
    
    # 验证安装
    if command_exists node; then
        log_success "Node.js $(node -v) 安装成功"
        return 0
    else
        return 1
    fi
}

# 安装 Node.js - Arch Linux
install_node_arch() {
    local sudo=$(get_sudo)
    log_info "使用 pacman 安装 Node.js..."
    
    $sudo pacman -S --noconfirm nodejs npm
    
    if command_exists node; then
        log_success "Node.js $(node -v) 安装成功"
        return 0
    else
        return 1
    fi
}

# 安装 Node.js - 使用 nvm
install_node_nvm() {
    log_info "使用 nvm 安装 Node.js..."
    
    # 安装 nvm
    if [ ! -d "$HOME/.nvm" ]; then
        log_info "安装 nvm..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    fi
    
    # 加载 nvm
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    # 安装 Node.js 20
    log_info "安装 Node.js 20..."
    nvm install 20
    nvm use 20
    nvm alias default 20
    
    if command_exists node; then
        log_success "Node.js $(node -v) 安装成功"
        return 0
    else
        return 1
    fi
}

# 自动安装 Node.js
auto_install_node() {
    local distro=$(detect_distro)
    
    log_step "自动安装 Node.js"
    log_info "检测到 Linux 发行版: $distro"
    
    case $distro in
        ubuntu|debian)
            install_node_debian
            ;;
        centos|rhel|fedora|rocky|almalinux)
            install_node_rhel
            ;;
        arch|manjaro)
            install_node_arch
            ;;
        *)
            log_warning "未知发行版，尝试使用 nvm 安装..."
            install_node_nvm
            ;;
    esac
}

# 显示手动安装指引
show_manual_install_guide() {
    echo -e "
${BRIGHT}Node.js 手动安装指引：${RESET}

${YELLOW}Ubuntu/Debian:${RESET}
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs

${YELLOW}CentOS/RHEL/Fedora:${RESET}
  curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
  sudo yum install -y nodejs

${YELLOW}Arch Linux:${RESET}
  sudo pacman -S nodejs npm

${YELLOW}使用 nvm（推荐开发者）:${RESET}
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  source ~/.bashrc
  nvm install 20
  nvm use 20

${YELLOW}验证安装:${RESET}
  node -v   # 应显示 v20.x.x
  npm -v    # 应显示 10.x.x

${CYAN}安装完成后，请重新运行此脚本继续安装 IDC设备管理系统${RESET}
"
}

# 检查并安装依赖
check_and_install_dependencies() {
    log_step "检查系统依赖"
    
    local sudo=$(get_sudo)
    local distro=$(detect_distro)
    local needs_install=()
    
    # 检查 git
    if ! command_exists git; then
        needs_install+=("git")
    fi
    
    # 检查 curl
    if ! command_exists curl; then
        needs_install+=("curl")
    fi
    
    # 检查 wget（可选）
    if ! command_exists wget; then
        needs_install+=("wget")
    fi
    
    if [ ${#needs_install[@]} -gt 0 ]; then
        log_info "需要安装依赖: ${needs_install[*]}"
        
        case $distro in
            ubuntu|debian)
                $sudo apt-get update -qq
                $sudo apt-get install -y -qq "${needs_install[@]}"
                ;;
            centos|rhel|fedora|rocky|almalinux)
                $sudo yum install -y -q "${needs_install[@]}"
                ;;
            arch|manjaro)
                $sudo pacman -S --noconfirm "${needs_install[@]}"
                ;;
            *)
                log_warning "无法自动安装依赖，请手动安装: ${needs_install[*]}"
                return 1
                ;;
        esac
        
        log_success "依赖安装完成"
    else
        log_success "系统依赖已满足"
    fi
}

# 主函数
main() {
    show_banner
    
    # 检查是否在正确的目录
    if [ ! -f "$SCRIPT_DIR/install.js" ]; then
        log_error "未找到 install.js 文件"
        log_info "请在项目根目录运行此脚本"
        exit 1
    fi
    
    # 检查 Node.js
    log_step "检查 Node.js 环境"
    
    if command_exists node; then
        local node_version=$(get_node_version)
        log_info "检测到 Node.js: $(node -v)"
        
        if check_node_version; then
            log_success "Node.js 版本满足要求 (>= v$MIN_NODE_VERSION)"
        else
            log_warning "Node.js 版本过低 (v$node_version < v$MIN_NODE_VERSION)"
            
            echo -e "\n${YELLOW}请选择操作：${RESET}"
            echo "  1) 自动升级 Node.js 到 v20（推荐）"
            echo "  2) 显示手动安装指引"
            echo "  3) 退出"
            
            read -p "请选择 [1-3]: " choice
            
            case $choice in
                1)
                    auto_install_node || {
                        log_error "Node.js 升级失败"
                        show_manual_install_guide
                        exit 1
                    }
                    # 重新加载环境
                    export PATH="/usr/bin:$HOME/.nvm/versions/node/v20*/bin:$PATH"
                    hash -r
                    ;;
                2)
                    show_manual_install_guide
                    exit 0
                    ;;
                3)
                    log_info "已取消安装"
                    exit 0
                    ;;
                *)
                    log_error "无效选择"
                    exit 1
                    ;;
            esac
        fi
    else
        log_warning "未检测到 Node.js"
        
        echo -e "\n${YELLOW}请选择操作：${RESET}"
        echo "  1) 自动安装 Node.js v20（推荐）"
        echo "  2) 显示手动安装指引"
        echo "  3) 退出"
        
        read -p "请选择 [1-3]: " choice
        
        case $choice in
            1)
                check_and_install_dependencies
                auto_install_node || {
                    log_error "Node.js 安装失败"
                    show_manual_install_guide
                    exit 1
                }
                # 重新加载环境
                export PATH="/usr/bin:$HOME/.nvm/versions/node/v20*/bin:$PATH"
                hash -r
                ;;
            2)
                show_manual_install_guide
                exit 0
                ;;
            3)
                log_info "已取消安装"
                exit 0
                ;;
            *)
                log_error "无效选择"
                exit 1
                ;;
        esac
    fi
    
    # 检查 npm
    log_step "检查 npm"
    if command_exists npm; then
        log_success "npm $(npm -v)"
    else
        log_error "npm 未安装"
        exit 1
    fi
    
    log_divider
    log_success "环境检查通过！"
    
    # 运行 install.js
    log_step "启动安装程序"
    log_info "正在运行 install.js..."
    echo ""
    
    cd "$SCRIPT_DIR"
    node install.js "$@"
}

# 运行主函数
main "$@"
