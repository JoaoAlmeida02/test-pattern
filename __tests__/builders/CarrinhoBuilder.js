import { Carrinho } from '../../src/domain/Carrinho.js';
import { Item } from '../../src/domain/Item.js';
import { UserMother } from './UserMother.js';

/**
 * Data Builder: monta carrinhos de forma fluente.
 * Por padrão cria um carrinho com um usuário padrão e 1 item de R$ 100,00.
 */
export class CarrinhoBuilder {
    constructor() {
        this.user = UserMother.umUsuarioPadrao();
        this.itens = [new Item('Item Padrao', 100)];
    }

    comUser(user) {
        this.user = user;
        return this;
    }

    comItens(itens) {
        this.itens = itens;
        return this;
    }

    comItem(nome, preco) {
        this.itens = [...this.itens, new Item(nome, preco)];
        return this;
    }

    vazio() {
        this.itens = [];
        return this;
    }

    build() {
        return new Carrinho(this.user, this.itens);
    }
}
