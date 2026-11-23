import { CheckoutService } from '../src/services/CheckoutService.js';
import { Item } from '../src/domain/Item.js';
import { Pedido } from '../src/domain/Pedido.js';
import { UserMother } from './builders/UserMother.js';
import { CarrinhoBuilder } from './builders/CarrinhoBuilder.js';

describe('CheckoutService', () => {
    const cartao = { numero: '4111111111111111' };

    // Dummies: objetos que só preenchem parâmetros e não devem ser usados.
    const criarRepositoryDummy = () => ({ salvar: jest.fn() });
    const criarEmailDummy = () => ({ enviarEmail: jest.fn() });

    describe('quando o pagamento falha', () => {
        let gatewayStub, repositoryDummy, emailDummy, checkoutService, carrinho;

        beforeEach(() => {
            // Arrange
            carrinho = new CarrinhoBuilder().build();
            gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: false }) };
            repositoryDummy = criarRepositoryDummy();
            emailDummy = criarEmailDummy();
            checkoutService = new CheckoutService(gatewayStub, repositoryDummy, emailDummy);
        });

        it('deve retornar null (verificação de estado)', async () => {
            // Act
            const pedido = await checkoutService.processarPedido(carrinho, cartao);

            // Assert
            expect(pedido).toBeNull();
        });

        it('não deve chamar o EmailService nem o PedidoRepository (verificação de comportamento)', async () => {
            // Act
            await checkoutService.processarPedido(carrinho, cartao);

            // Assert
            expect(emailDummy.enviarEmail).not.toHaveBeenCalled();
            expect(repositoryDummy.salvar).not.toHaveBeenCalled();
        });
    });

    describe('quando um cliente padrão finaliza a compra', () => {
        it('deve retornar o pedido salvo com o totalFinal sem desconto (verificação de estado)', async () => {
            // Arrange
            const carrinho = new CarrinhoBuilder()
                .comUser(UserMother.umUsuarioPadrao())
                .comItens([new Item('Livro', 120), new Item('Caneta', 30)])
                .build();
            const pedidoSalvo = new Pedido(10, carrinho, 150, 'PROCESSADO');
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const repositoryStub = { salvar: jest.fn().mockResolvedValue(pedidoSalvo) };
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, criarEmailDummy());

            // Act
            const pedido = await checkoutService.processarPedido(carrinho, cartao);

            // Assert
            expect(pedido).toBe(pedidoSalvo);
            expect(pedido.totalFinal).toBe(150);
            expect(pedido.status).toBe('PROCESSADO');
        });

        it('deve cobrar o valor cheio no gateway, sem desconto', async () => {
            // Arrange
            const carrinho = new CarrinhoBuilder().build(); // 1 item de R$ 100
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const repositoryStub = {
                salvar: jest.fn().mockResolvedValue(new Pedido(1, carrinho, 100, 'PROCESSADO')),
            };
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, criarEmailDummy());

            // Act
            await checkoutService.processarPedido(carrinho, cartao);

            // Assert
            expect(gatewayStub.cobrar).toHaveBeenCalledWith(100, cartao);
        });
    });

    describe('quando um cliente Premium finaliza a compra', () => {
        let carrinho, gatewayStub, repositoryStub, emailMock, checkoutService, pedidoSalvo;

        beforeEach(() => {
            // Arrange
            carrinho = new CarrinhoBuilder()
                .comUser(UserMother.umUsuarioPremium())
                .comItens([new Item('Fone de Ouvido', 200)])
                .build();
            pedidoSalvo = new Pedido(99, carrinho, 180, 'PROCESSADO');

            gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            repositoryStub = { salvar: jest.fn().mockResolvedValue(pedidoSalvo) };
            emailMock = { enviarEmail: jest.fn().mockResolvedValue(undefined) };

            checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailMock);
        });

        it('deve cobrar R$ 180,00 no gateway aplicando 10% de desconto', async () => {
            // Act
            await checkoutService.processarPedido(carrinho, cartao);

            // Assert (comportamento)
            expect(gatewayStub.cobrar).toHaveBeenCalledTimes(1);
            expect(gatewayStub.cobrar).toHaveBeenCalledWith(180, cartao);
        });

        it('deve enviar 1 e-mail com os dados corretos após o pagamento aprovado', async () => {
            // Act
            await checkoutService.processarPedido(carrinho, cartao);

            // Assert (comportamento)
            expect(emailMock.enviarEmail).toHaveBeenCalledTimes(1);
            expect(emailMock.enviarEmail).toHaveBeenCalledWith(
                'premium@email.com',
                'Seu Pedido foi Aprovado!',
                'Pedido 99 no valor de R$180'
            );
        });

        it('deve retornar o pedido salvo com o totalFinal com desconto', async () => {
            // Act
            const pedido = await checkoutService.processarPedido(carrinho, cartao);

            // Assert (estado)
            expect(pedido).toBe(pedidoSalvo);
            expect(pedido.totalFinal).toBe(180);
        });

        it('deve salvar o pedido PROCESSADO com o total com desconto', async () => {
            // Act
            await checkoutService.processarPedido(carrinho, cartao);

            // Assert
            expect(repositoryStub.salvar).toHaveBeenCalledTimes(1);
            const pedidoEnviado = repositoryStub.salvar.mock.calls[0][0];
            expect(pedidoEnviado.totalFinal).toBe(180);
            expect(pedidoEnviado.status).toBe('PROCESSADO');
            expect(pedidoEnviado.carrinho).toBe(carrinho);
        });
    });

    describe('quando o envio de e-mail falha', () => {
        it('não deve falhar o checkout e deve retornar o pedido salvo', async () => {
            // Arrange
            const carrinho = new CarrinhoBuilder().build();
            const pedidoSalvo = new Pedido(5, carrinho, 100, 'PROCESSADO');
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const repositoryStub = { salvar: jest.fn().mockResolvedValue(pedidoSalvo) };
            const emailStub = { enviarEmail: jest.fn().mockRejectedValue(new Error('SMTP fora do ar')) };
            const erroSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailStub);

            // Act
            const pedido = await checkoutService.processarPedido(carrinho, cartao);

            // Assert
            expect(pedido).toBe(pedidoSalvo);
            expect(erroSpy).toHaveBeenCalledWith('Falha ao enviar e-mail', 'SMTP fora do ar');
            erroSpy.mockRestore();
        });
    });

    describe('CarrinhoBuilder', () => {
        it('deve criar um carrinho vazio com total 0', () => {
            const carrinho = new CarrinhoBuilder().vazio().build();

            expect(carrinho.itens).toEqual([]);
            expect(carrinho.calcularTotal()).toBe(0);
        });
    });
});
