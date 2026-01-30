/**
 * extend Shell command handler index
 *
 * Exports command:search handler for Layer 3 command discovery.
 *
 * Core Exports:
 * - CommandSearchHandler: command:search handler
 */

export { CommandSearchHandler, parseCommandSearchCommand, type ParsedCommandSearchCommand } from './command-search.ts';
