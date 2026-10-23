# Testar a API Pedido Magistral (respostas, sem mudanças no projeto)

## 1. Preciso instalar um agente em um banco novo?
Não. O Pedido Magistral usa o mesmo banco Firebird da Pharmapele que já atende o Logitech. Basta **atualizar o agente que já está instalado** lá. Um único agente cuida das duas APIs.

## 2. Preciso publicar a versão no GitHub antes?
Sim. A versão 1.6.0 é a primeira que sabe ler as 7 tabelas do Pedido Magistral, e ela ainda não foi publicada. A ordem é:
1. Publicar o release `agent-v1.6.0` no GitHub, como nas versões anteriores.
2. Me pedir para atualizar a versão e o link do instalador para 1.6.0 nas configurações.
3. Clicar em "Atualizar todos os agentes" em Bancos. O agente da Pharmapele baixa e instala sozinho.
4. Clicar em "Pedido Magistral agora" no banco da Pharmapele.
5. Em Empresas → APIs, ligar o Pedido Magistral e gerar uma chave.

## 3. Isso vai afetar o Logitech?
Muito pouco, e por pouco tempo:
- **Durante a atualização** o serviço para por cerca de 1 minuto. Nenhuma entrega se perde: o próximo ciclo traz tudo de novo, porque ele sempre lê os últimos 60 dias.
- **Depois da atualização** o Pedido Magistral roda como uma tarefa separada, uma vez por dia. As entregas continuam a cada 30 minutos. A API do Logitech não muda: mesmo endereço, mesma chave.
- **Risco:** a 1.6.0 ainda não rodou no seu Firebird. Se algum nome de campo estiver diferente, só a tarefa do Pedido Magistral falha e mostra o erro. As entregas continuam.

## Opção mais segura (se quiser)
Se preferir não mexer na Pharmapele agora, dá para instalar a 1.6.0 primeiro em uma máquina de teste que acesse uma cópia do banco. Assim você valida o Pedido Magistral antes de atualizar o servidor da Pharmapele.
