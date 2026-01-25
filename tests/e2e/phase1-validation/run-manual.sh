#!/bin/bash
# =============================================================================
# PRD Phase 1 Manual Test Runner
# =============================================================================
#
# This script helps execute manual test cases for PRD Phase 1 validation.
# It sets up the test environment and guides users through manual tests.
#
# Usage:
#     ./run-manual.sh [setup|teardown|test-skill|test-cli|all]
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
FIXTURES_DIR="$SCRIPT_DIR/fixtures"
TEST_HOME="$HOME/.synapse-test"
TEST_SKILLS_DIR="$TEST_HOME/skills"

# =============================================================================
# Helper Functions
# =============================================================================

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

print_step() {
    echo -e "${YELLOW}>>> $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

wait_for_user() {
    echo ""
    read -p "Press Enter to continue..."
}

# =============================================================================
# Setup Functions
# =============================================================================

setup_test_environment() {
    print_header "Setting Up Test Environment"

    # Create test directories
    print_step "Creating test directories..."
    mkdir -p "$TEST_SKILLS_DIR"
    mkdir -p "$TEST_HOME/bin"
    mkdir -p "$TEST_HOME/mcp"
    mkdir -p "$TEST_HOME/conversations"

    # Copy test skills
    print_step "Copying test skills..."
    if [ -d "$FIXTURES_DIR/skills" ]; then
        cp -r "$FIXTURES_DIR/skills/"* "$TEST_SKILLS_DIR/"

        # Make scripts executable
        find "$TEST_SKILLS_DIR" -name "*.sh" -exec chmod +x {} \;
        find "$TEST_SKILLS_DIR" -name "*.py" -exec chmod +x {} \;

        print_success "Copied skills: text-analyzer, file-utils"
    else
        print_error "Fixtures directory not found: $FIXTURES_DIR/skills"
        return 1
    fi

    # Copy MCP config
    print_step "Copying MCP configuration..."
    if [ -f "$FIXTURES_DIR/mcp/mcp_servers.json" ]; then
        cp "$FIXTURES_DIR/mcp/mcp_servers.json" "$TEST_HOME/mcp/"
        print_success "Copied MCP configuration"
    fi

    print_success "Test environment setup complete!"
    echo ""
    echo "Test home: $TEST_HOME"
    echo "Skills: $TEST_SKILLS_DIR"
    echo ""
}

teardown_test_environment() {
    print_header "Cleaning Up Test Environment"

    if [ -d "$TEST_HOME" ]; then
        print_step "Removing test directory: $TEST_HOME"
        rm -rf "$TEST_HOME"
        print_success "Test environment cleaned up"
    else
        print_info "Test directory does not exist"
    fi
}

# =============================================================================
# Test Functions
# =============================================================================

test_skill_execution() {
    print_header "Manual Test: Skill Execution (TC-5.4)"

    echo "This test verifies that custom skills can be executed."
    echo ""
    echo "Prerequisites:"
    echo "  - Test environment is set up"
    echo "  - ANTHROPIC_API_KEY is configured"
    echo ""

    print_step "Test 1: text-analyzer skill"
    echo ""
    echo "Steps:"
    echo "  1. Create a test file: echo 'Hello World' > /tmp/test-analyze.txt"
    echo "  2. Start Synapse: bun run chat"
    echo "  3. Search for skill: skill search 'text analyzer'"
    echo "  4. Ask Agent to analyze: '请分析 /tmp/test-analyze.txt 文件'"
    echo ""
    echo "Expected:"
    echo "  - Agent finds text-analyzer skill"
    echo "  - Agent reads and analyzes the file"
    echo "  - Returns line count, word count, etc."
    echo ""

    wait_for_user

    print_step "Test 2: file-utils skill"
    echo ""
    echo "Steps:"
    echo "  1. Start Synapse: bun run chat"
    echo "  2. Search for skill: skill search 'file utils'"
    echo "  3. Ask Agent: '使用 file-utils 统计 /tmp 目录的文件类型'"
    echo ""
    echo "Expected:"
    echo "  - Agent finds file-utils skill"
    echo "  - Agent executes count_files script"
    echo "  - Returns file count by extension"
    echo ""

    wait_for_user

    print_success "Skill execution tests complete"
}

test_cli_interaction() {
    print_header "Manual Test: CLI Interaction (TC-4.1, TC-4.4)"

    echo "This test verifies CLI and context management."
    echo ""

    print_step "Test 1: Basic CLI Interaction"
    echo ""
    echo "Steps:"
    echo "  1. Start Synapse: bun run chat"
    echo "  2. Verify welcome message appears"
    echo "  3. Verify prompt shows 'You (1)>'"
    echo "  4. Type a message and press Enter"
    echo "  5. Verify Agent responds"
    echo "  6. Verify prompt increments to 'You (2)>'"
    echo ""

    wait_for_user

    print_step "Test 2: Context Management"
    echo ""
    echo "Steps:"
    echo "  1. In Synapse, say: '我的名字是张三'"
    echo "  2. Then ask: '我叫什么名字？'"
    echo "  3. Verify Agent remembers '张三'"
    echo "  4. Type: /clear"
    echo "  5. Ask again: '我叫什么名字？'"
    echo "  6. Verify Agent no longer knows the name"
    echo ""

    wait_for_user

    print_step "Test 3: Special Commands"
    echo ""
    echo "Steps:"
    echo "  1. Test /help - shows help"
    echo "  2. Test /tools - lists tools"
    echo "  3. Test /skills - lists skills"
    echo "  4. Test /sessions - lists sessions"
    echo "  5. Test /exit - exits program"
    echo ""

    wait_for_user

    print_step "Test 4: Shell Command Execution"
    echo ""
    echo "Steps:"
    echo "  1. Type: !echo 'hello world'"
    echo "  2. Verify output: hello world"
    echo "  3. Type: !ls -la /tmp"
    echo "  4. Verify directory listing appears"
    echo "  5. Type: !false"
    echo "  6. Verify shows 'Command exited with code 1'"
    echo ""

    wait_for_user

    print_success "CLI interaction tests complete"
}

test_session_persistence() {
    print_header "Manual Test: Session Persistence (TC-7.1)"

    echo "This test verifies session save and restore."
    echo ""

    print_step "Test: Save and Restore Session"
    echo ""
    echo "Steps:"
    echo "  1. Start Synapse: bun run chat"
    echo "  2. Have a conversation (2-3 exchanges)"
    echo "  3. Note the session ID (shown in prompt or /sessions)"
    echo "  4. Type /exit to quit"
    echo "  5. Start Synapse again: bun run chat"
    echo "  6. Type /sessions to see saved sessions"
    echo "  7. Type /resume <session-id>"
    echo "  8. Verify conversation history is restored"
    echo "  9. Ask about previous context to verify"
    echo ""

    wait_for_user

    print_success "Session persistence tests complete"
}

test_complete_workflow() {
    print_header "Manual Test: Complete Workflow (TC-8.1)"

    echo "This test verifies an end-to-end user workflow."
    echo ""

    print_step "Scenario: Analyze and Modify Code File"
    echo ""
    echo "Steps:"
    echo "  1. Create test file:"
    echo "     echo 'function hello() { console.log(\"Hello\"); }' > /tmp/code.js"
    echo ""
    echo "  2. Start Synapse: bun run chat"
    echo ""
    echo "  3. Ask Agent to read the file:"
    echo "     '请读取 /tmp/code.js 文件'"
    echo ""
    echo "  4. Ask Agent to analyze:"
    echo "     '分析这个函数的功能'"
    echo ""
    echo "  5. Ask Agent to modify:"
    echo "     '把函数名从 hello 改成 greet'"
    echo ""
    echo "  6. Verify the change:"
    echo "     !cat /tmp/code.js"
    echo "     Should show: function greet() { console.log(\"Hello\"); }"
    echo ""

    wait_for_user

    print_success "Complete workflow test complete"
}

run_all_manual_tests() {
    print_header "Running All Manual Tests"

    setup_test_environment

    echo ""
    echo "Manual tests will be run in sequence."
    echo "Follow the instructions for each test."
    echo ""

    wait_for_user

    test_cli_interaction
    test_skill_execution
    test_session_persistence
    test_complete_workflow

    print_header "All Manual Tests Complete"
    echo ""
    echo "Please record your results in the test checklist."
    echo "See: tests/e2e/phase1-validation/test-cases.md"
    echo ""
}

# =============================================================================
# Main
# =============================================================================

show_usage() {
    echo "PRD Phase 1 Manual Test Runner"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  setup      Set up test environment"
    echo "  teardown   Clean up test environment"
    echo "  skill      Run skill execution tests"
    echo "  cli        Run CLI interaction tests"
    echo "  session    Run session persistence tests"
    echo "  workflow   Run complete workflow test"
    echo "  all        Run all manual tests"
    echo "  help       Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 setup       # Set up before testing"
    echo "  $0 all         # Run all manual tests"
    echo "  $0 teardown    # Clean up after testing"
}

case "${1:-help}" in
    setup)
        setup_test_environment
        ;;
    teardown)
        teardown_test_environment
        ;;
    skill)
        test_skill_execution
        ;;
    cli)
        test_cli_interaction
        ;;
    session)
        test_session_persistence
        ;;
    workflow)
        test_complete_workflow
        ;;
    all)
        run_all_manual_tests
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_usage
        exit 1
        ;;
esac
