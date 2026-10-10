import { type EnumTypeDefinitionNode, Kind, parse } from 'graphql'
import { describe, expect, it, vi } from 'vitest'

import { PROTOCOLS_META } from '@/config/protocols-meta'

// Only the SDL is under test; the resolvers would pull in the database layer.
vi.mock('../resolvers', () => ({ resolvers: {} }))

const { typeDefs } = await import('../schema')

function enumValues(name: string): string[] {
  const node = parse(typeDefs).definitions.find(
    (d): d is EnumTypeDefinitionNode =>
      d.kind === Kind.ENUM_TYPE_DEFINITION && d.name.value === name
  )
  return node?.values?.map((v) => v.name.value) ?? []
}

describe('GraphQL schema', () => {
  it('ProtocolName names every registered provider', () => {
    // A provider missing here made every Blend row fail to serialize: the
    // response came back `data: null` for any query that reached one.
    const providers = new Set(
      Object.values(PROTOCOLS_META).map((meta) => meta.provider)
    )
    expect(enumValues('ProtocolName')).toEqual(
      expect.arrayContaining([...providers])
    )
  })
})
