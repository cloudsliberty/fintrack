<?php

declare(strict_types=1);

namespace OCA\FinTrack\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version1000Date20250101000000 extends SimpleMigrationStep {

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        // ── fintrack_accounts ──
        if (!$schema->hasTable('fintrack_accounts')) {
            $table = $schema->createTable('fintrack_accounts');
            $table->addColumn('id',          Types::BIGINT,   ['autoincrement' => true, 'notnull' => true, 'unsigned' => true]);
            $table->addColumn('user_id',     Types::STRING,   ['notnull' => true,  'length' => 64]);
            $table->addColumn('name',        Types::STRING,   ['notnull' => true,  'length' => 255]);
            $table->addColumn('type',        Types::STRING,   ['notnull' => true,  'length' => 20]);
            $table->addColumn('currency',    Types::STRING,   ['notnull' => true,  'length' => 10]);
            $table->addColumn('description', Types::TEXT,     ['notnull' => false, 'default' => '']);
            $table->addColumn('icon',        Types::STRING,   ['notnull' => false, 'length' => 20,  'default' => '']);
            $table->addColumn('color',       Types::STRING,   ['notnull' => false, 'length' => 20,  'default' => '#4f8ef7']);
            $table->addColumn('active',      Types::SMALLINT, ['notnull' => true,  'default' => 1, 'unsigned' => true]);
            $table->addColumn('created_at',  Types::BIGINT,   ['notnull' => true,  'default' => 0]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id'], 'fintrack_acc_user');
            $table->addIndex(['type'],    'fintrack_acc_type');
        }

        // ── fintrack_transactions ──
        if (!$schema->hasTable('fintrack_transactions')) {
            $table = $schema->createTable('fintrack_transactions');
            $table->addColumn('id',           Types::BIGINT,  ['autoincrement' => true, 'notnull' => true, 'unsigned' => true]);
            $table->addColumn('user_id',      Types::STRING,  ['notnull' => true,  'length' => 64]);
            $table->addColumn('account_id',   Types::BIGINT,  ['notnull' => true]);
            $table->addColumn('type',         Types::STRING,  ['notnull' => true,  'length' => 10]);
            $table->addColumn('amount',       Types::DECIMAL, ['notnull' => true,  'precision' => 15, 'scale' => 4]);
            $table->addColumn('currency',     Types::STRING,  ['notnull' => true,  'length' => 10]);
            $table->addColumn('description',  Types::STRING,  ['notnull' => false, 'length' => 500, 'default' => '']);
            $table->addColumn('category',     Types::STRING,  ['notnull' => false, 'length' => 100, 'default' => '']);
            $table->addColumn('tags',         Types::TEXT,    ['notnull' => false, 'default' => '[]']);
            $table->addColumn('notes',        Types::TEXT,    ['notnull' => false, 'default' => '']);
            $table->addColumn('date',         Types::BIGINT,  ['notnull' => true]);
            $table->addColumn('source',       Types::STRING,  ['notnull' => false, 'length' => 50,  'default' => 'manual']);
            $table->addColumn('recurring_id', Types::BIGINT,  ['notnull' => false, 'default' => null]);
            $table->addColumn('created_at',   Types::BIGINT,  ['notnull' => true,  'default' => 0]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id'],    'fintrack_tx_user');
            $table->addIndex(['account_id'], 'fintrack_tx_acc');
            $table->addIndex(['date'],       'fintrack_tx_date');
            $table->addIndex(['type'],       'fintrack_tx_type');
        }

        // ── fintrack_transfers ──
        if (!$schema->hasTable('fintrack_transfers')) {
            $table = $schema->createTable('fintrack_transfers');
            $table->addColumn('id',              Types::BIGINT,  ['autoincrement' => true, 'notnull' => true, 'unsigned' => true]);
            $table->addColumn('user_id',         Types::STRING,  ['notnull' => true, 'length' => 64]);
            $table->addColumn('from_account_id', Types::BIGINT,  ['notnull' => true]);
            $table->addColumn('to_account_id',   Types::BIGINT,  ['notnull' => true]);
            $table->addColumn('from_amount',     Types::DECIMAL, ['notnull' => true, 'precision' => 15, 'scale' => 4]);
            $table->addColumn('to_amount',       Types::DECIMAL, ['notnull' => true, 'precision' => 15, 'scale' => 4]);
            $table->addColumn('from_currency',   Types::STRING,  ['notnull' => true, 'length' => 10]);
            $table->addColumn('to_currency',     Types::STRING,  ['notnull' => true, 'length' => 10]);
            $table->addColumn('conversion_rate', Types::DECIMAL, ['notnull' => true, 'precision' => 15, 'scale' => 8, 'default' => '1.00000000']);
            $table->addColumn('description',     Types::STRING,  ['notnull' => false, 'length' => 500, 'default' => '']);
            $table->addColumn('date',            Types::BIGINT,  ['notnull' => true]);
            $table->addColumn('created_at',      Types::BIGINT,  ['notnull' => true, 'default' => 0]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id'], 'fintrack_tr_user');
            $table->addIndex(['date'],    'fintrack_tr_date');
        }

        // ── fintrack_budgets ──
        if (!$schema->hasTable('fintrack_budgets')) {
            $table = $schema->createTable('fintrack_budgets');
            $table->addColumn('id',         Types::BIGINT,   ['autoincrement' => true, 'notnull' => true, 'unsigned' => true]);
            $table->addColumn('user_id',    Types::STRING,   ['notnull' => true,  'length' => 64]);
            $table->addColumn('name',       Types::STRING,   ['notnull' => true,  'length' => 255]);
            $table->addColumn('limit_amt',  Types::DECIMAL,  ['notnull' => true,  'precision' => 15, 'scale' => 4]);
            $table->addColumn('currency',   Types::STRING,   ['notnull' => true,  'length' => 10]);
            $table->addColumn('period',     Types::STRING,   ['notnull' => true,  'length' => 20]);
            $table->addColumn('category',   Types::STRING,   ['notnull' => false, 'length' => 100, 'default' => '']);
            $table->addColumn('active',     Types::SMALLINT, ['notnull' => true,  'default' => 1, 'unsigned' => true]);
            $table->addColumn('start_date', Types::BIGINT,   ['notnull' => true,  'default' => 0]);
            $table->addColumn('created_at', Types::BIGINT,   ['notnull' => true,  'default' => 0]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id'], 'fintrack_bud_user');
        }

        // ── fintrack_categories ──
        if (!$schema->hasTable('fintrack_categories')) {
            $table = $schema->createTable('fintrack_categories');
            $table->addColumn('id',      Types::BIGINT, ['autoincrement' => true, 'notnull' => true, 'unsigned' => true]);
            $table->addColumn('user_id', Types::STRING, ['notnull' => true,  'length' => 64]);
            $table->addColumn('name',    Types::STRING, ['notnull' => true,  'length' => 100]);
            $table->addColumn('type',    Types::STRING, ['notnull' => true,  'length' => 20]);
            $table->addColumn('icon',    Types::STRING, ['notnull' => false, 'length' => 20,  'default' => '']);
            $table->addColumn('color',   Types::STRING, ['notnull' => false, 'length' => 20,  'default' => '#4f8ef7']);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id'], 'fintrack_cat_user');
        }

        // ── fintrack_currencies ──
        if (!$schema->hasTable('fintrack_currencies')) {
            $table = $schema->createTable('fintrack_currencies');
            $table->addColumn('id',      Types::BIGINT,  ['autoincrement' => true, 'notnull' => true, 'unsigned' => true]);
            $table->addColumn('user_id', Types::STRING,  ['notnull' => true, 'length' => 64]);
            $table->addColumn('code',    Types::STRING,  ['notnull' => true, 'length' => 10]);
            $table->addColumn('name',    Types::STRING,  ['notnull' => true, 'length' => 100]);
            $table->addColumn('symbol',  Types::STRING,  ['notnull' => true, 'length' => 10]);
            $table->addColumn('rate',    Types::DECIMAL, ['notnull' => true, 'precision' => 15, 'scale' => 8]);
            $table->setPrimaryKey(['id']);
            $table->addUniqueIndex(['user_id', 'code'], 'fintrack_cur_user_code');
        }

        // ── fintrack_recurring ──
        if (!$schema->hasTable('fintrack_recurring')) {
            $table = $schema->createTable('fintrack_recurring');
            $table->addColumn('id',          Types::BIGINT,   ['autoincrement' => true, 'notnull' => true, 'unsigned' => true]);
            $table->addColumn('user_id',     Types::STRING,   ['notnull' => true,  'length' => 64]);
            $table->addColumn('name',        Types::STRING,   ['notnull' => true,  'length' => 255]);
            $table->addColumn('type',        Types::STRING,   ['notnull' => true,  'length' => 10]);
            $table->addColumn('account_id',  Types::BIGINT,   ['notnull' => true]);
            $table->addColumn('amount',      Types::DECIMAL,  ['notnull' => true,  'precision' => 15, 'scale' => 4]);
            $table->addColumn('currency',    Types::STRING,   ['notnull' => true,  'length' => 10]);
            $table->addColumn('frequency',   Types::STRING,   ['notnull' => true,  'length' => 20]);
            $table->addColumn('next_date',   Types::BIGINT,   ['notnull' => true]);
            $table->addColumn('last_posted', Types::BIGINT,   ['notnull' => false, 'default' => null]);
            $table->addColumn('category',    Types::STRING,   ['notnull' => false, 'length' => 100, 'default' => '']);
            $table->addColumn('description', Types::STRING,   ['notnull' => false, 'length' => 500, 'default' => '']);
            $table->addColumn('tags',        Types::TEXT,     ['notnull' => false, 'default' => '[]']);
            $table->addColumn('active',      Types::SMALLINT, ['notnull' => true,  'default' => 1, 'unsigned' => true]);
            $table->addColumn('created_at',  Types::BIGINT,   ['notnull' => true,  'default' => 0]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id'],   'fintrack_rec_user');
            $table->addIndex(['next_date'], 'fintrack_rec_date');
        }

        // ── fintrack_settings ──
        if (!$schema->hasTable('fintrack_settings')) {
            $table = $schema->createTable('fintrack_settings');
            $table->addColumn('id',      Types::BIGINT, ['autoincrement' => true, 'notnull' => true, 'unsigned' => true]);
            $table->addColumn('user_id', Types::STRING, ['notnull' => true,  'length' => 64]);
            $table->addColumn('key',     Types::STRING, ['notnull' => true,  'length' => 64]);
            $table->addColumn('value',   Types::TEXT,   ['notnull' => false, 'default' => '']);
            $table->setPrimaryKey(['id']);
            $table->addUniqueIndex(['user_id', 'key'], 'fintrack_set_user_key');
        }

        return $schema;
    }
}
