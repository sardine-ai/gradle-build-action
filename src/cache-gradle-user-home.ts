import path from 'path'
import fs from 'fs'
import os from 'os'

import * as core from '@actions/core'
import * as cache from '@actions/cache'
import * as github from '@actions/github'
import {truncateArgs} from './cache-utils'

const CACHE_PATH = [
    '~/.gradle/caches/*', // All directories in 'caches'
    '~/.gradle/notifications/*', // Prevent the re-rendering of first-use message for version
    '~/.gradle/wrapper/dists/*/*/*.zip' // Only wrapper zips are required : Gradle will expand these on demand
]
const GUH_CACHE_KEY = 'GUH_CACHE_KEY'
const GUH_CACHE_RESULT = 'GUH_CACHE_RESULT'

export async function restore(): Promise<void> {
    if (!isGradleUserHomeCacheEnabled()) return

    if (gradleUserHomeExists()) {
        core.debug('Gradle User Home already exists. Not restoring from cache.')
        return
    }

    const runnerOs = process.env[`RUNNER_OS`] || ''
    const cacheKeyPrefix = `${runnerOs}-gradle|`

    const args = truncateArgs(core.getInput('arguments'))
    const cacheKeyWithArgs = `${cacheKeyPrefix}${args}|`

    const cacheKey = `${cacheKeyWithArgs}${github.context.sha}`

    core.saveState(GUH_CACHE_KEY, cacheKey)

    const cacheResult = await cache.restoreCache(CACHE_PATH, cacheKey, [
        cacheKeyWithArgs,
        cacheKeyPrefix
    ])

    if (!cacheResult) {
        core.info(
            'Gradle User Home cache not found. Will start with empty home.'
        )
        return
    }

    core.info(`Gradle User Home restored from cache key: ${cacheResult}`)
    return
}

export async function save(): Promise<void> {
    if (!isGradleUserHomeCacheEnabled()) return

    if (!gradleUserHomeExists()) {
        core.debug('No Gradle User Home to cache.')
        return
    }

    const cacheKey = core.getState(GUH_CACHE_KEY)
    const cacheResult = core.getState(GUH_CACHE_RESULT)

    if (!cacheKey) {
        core.info(
            'Gradle User Home existed prior to cache restore. Not saving.'
        )
        return
    }

    if (cacheResult && cacheKey === cacheResult) {
        core.info(
            `Cache hit occurred on the cache key ${cacheKey}, not saving cache.`
        )
        return
    }

    core.info(`Caching Gradle User Home with cache key: ${cacheKey}`)
    try {
        await cache.saveCache(CACHE_PATH, cacheKey)
    } catch (error) {
        if (error.name === cache.ValidationError.name) {
            throw error
        } else if (error.name === cache.ReserveCacheError.name) {
            core.info(error.message)
        } else {
            core.info(`[warning] ${error.message}`)
        }
    }

    return
}

export function isGradleUserHomeCacheEnabled(): boolean {
    return core.getBooleanInput('gradle-user-home-cache-enabled')
}

function gradleUserHomeExists(): boolean {
    // Need to check for 'caches' directory to avoid incorrect detection on MacOS agents
    const dir = path.resolve(os.homedir(), '.gradle/caches')
    return fs.existsSync(dir)
}
